import { beforeEach, describe, expect, it } from "vitest";
import { EngineError, type Action } from "../../engine";
import * as rules from "../room";
import { AVATARS, HAND_PAUSE_MS, RoomError, type RoomState } from "../types";
import { historyFor, roomViewFor } from "../view";
import { nextActionId, T0, table, TestCtx, turnId } from "./helpers";

const AA = ["As", "Ah"];
const KK = ["Ks", "Kh"];
const QQ = ["Qs", "Qh"];
const DRY = ["2c", "7d", "9h", "Jc", "3d"];

function expectRoomError(fn: () => unknown, code: RoomError["code"]) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RoomError);
    expect((e as RoomError).code).toBe(code);
    return;
  }
  throw new Error(`Expected RoomError ${code}`);
}

let t: TestCtx;
beforeEach(() => {
  t = new TestCtx();
});

/** Current player takes an action. */
function go(r: RoomState, action: Action): RoomState {
  return rules.act(r, t.ctx, turnId(r)!, action, nextActionId());
}

function expectChipsConserved(r: RoomState) {
  expect(rules.roomChipTotal(r)).toBe(r.chipsIssued);
}

describe("create and join", () => {
  it("creates a room with default settings and the creator as host", () => {
    const { room, playerId } = rules.createRoom(t.ctx, { code: "ABCDEF", hostName: "  Ann  ", tokenHash: "h" });
    expect(room.settings).toEqual({ startingStack: 1000, smallBlind: 10, bigBlind: 20, turnSeconds: 30 });
    expect(room.hostId).toBe(playerId);
    expect(room.players[0]).toMatchObject({ name: "Ann", stack: 1000, seat: null });
    expect(room.status).toBe("waiting");
  });

  it("rejects bad settings and names", () => {
    const mk = (settings: object, hostName = "Ann") => () =>
      rules.createRoom(t.ctx, { code: "X", hostName, tokenHash: "h", settings });
    expectRoomError(mk({ startingStack: 50 }), "INVALID");
    expectRoomError(mk({ smallBlind: 30, bigBlind: 20 }), "INVALID");
    expectRoomError(mk({ bigBlind: 600 }), "INVALID");
    expectRoomError(mk({ turnSeconds: 5 }), "INVALID");
    expectRoomError(mk({ startingStack: 1000.5 }), "INVALID");
    expectRoomError(mk({}, "   "), "INVALID");
    expectRoomError(mk({}, "x".repeat(21)), "INVALID");
  });

  it("gives every joiner the same starting chips", () => {
    const { r } = table(t, ["Ann", "Bo", "Cy"], { startingStack: 500, smallBlind: 5, bigBlind: 10 });
    expect(r.players.map((p) => p.stack)).toEqual([500, 500, 500]);
    expect(r.chipsIssued).toBe(1500);
  });

  it("same token reconnects to the same player", () => {
    const { r, ids } = table(t);
    const again = rules.join(r, t.ctx, { name: "whatever", tokenHash: "hash-Bo" });
    expect(again.playerId).toBe(ids[1]);
    expect(again.room).toBe(r); // nothing changed
  });

  it("rejects duplicate names (case-insensitive)", () => {
    const { r } = table(t);
    expectRoomError(() => rules.join(r, t.ctx, { name: "bo", tokenHash: "new" }), "NAME_TAKEN");
  });

  it("caps the number of people in a room", () => {
    let { r } = table(t, ["Host"]);
    for (let i = 0; i < 29; i++) r = rules.join(r, t.ctx, { name: `P${i}`, tokenHash: `t${i}` }).room;
    expectRoomError(() => rules.join(r, t.ctx, { name: "Late", tokenHash: "late" }), "ROOM_FULL");
  });
});

describe("seats", () => {
  it("validates seats", () => {
    const { r, ids } = table(t, ["Ann", "Bo"]);
    const j = rules.join(r, t.ctx, { name: "Cy", tokenHash: "c" });
    expectRoomError(() => rules.sit(j.room, t.ctx, j.playerId, 0), "SEAT_TAKEN");
    expectRoomError(() => rules.sit(j.room, t.ctx, j.playerId, 9), "INVALID");
    expectRoomError(() => rules.sit(j.room, t.ctx, j.playerId, 1.5), "INVALID");
    expectRoomError(() => rules.sit(j.room, t.ctx, ids[0]!, 5), "INVALID"); // already seated
    expectRoomError(() => rules.sit(j.room, t.ctx, "ghost", 5), "UNAUTHORIZED");
  });

  it("standing up between hands frees the seat and keeps the chips", () => {
    let { r, ids } = table(t);
    r = rules.stand(r, t.ctx, ids[1]!);
    expect(r.players[1]).toMatchObject({ seat: null, stack: 1000 });
    r = rules.sit(r, t.ctx, ids[1]!, 7);
    expect(r.players[1]!.seat).toBe(7);
  });
});

describe("starting and playing", () => {
  it("only the host starts, with at least 2 seated players", () => {
    let { r, ids } = table(t, ["Ann", "Bo"]);
    expectRoomError(() => rules.startGame(r, t.ctx, ids[1]!), "FORBIDDEN");
    const lonely = rules.stand(r, t.ctx, ids[1]!);
    expectRoomError(() => rules.startGame(lonely, t.ctx, ids[0]!), "NOT_ENOUGH_PLAYERS");
    r = rules.startGame(r, t.ctx, ids[0]!);
    expect(r.status).toBe("playing");
    expect(r.hand!.handNumber).toBe(1);
    expect(r.turnDeadline).toBe(T0 + 30_000);
    expectRoomError(() => rules.startGame(r, t.ctx, ids[0]!), "INVALID");
  });

  it("applies actions, resets the timer each turn, and ignores a resent action id", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    expect(turnId(r)).toBe(ids[0]); // 3-handed: button acts first
    t.now += 4000;
    r = rules.act(r, t.ctx, ids[0]!, { type: "call" }, "same-id");
    expect(turnId(r)).toBe(ids[1]);
    expect(r.turnDeadline).toBe(T0 + 4000 + 30_000);
    const again = rules.act(r, t.ctx, ids[0]!, { type: "call" }, "same-id");
    expect(again).toBe(r);
    expect(() => rules.act(r, t.ctx, ids[2]!, { type: "fold" }, "x")).toThrow(EngineError);
    expectRoomError(() => rules.act(r, t.ctx, ids[1]!, { type: "fold" }, ""), "INVALID");
  });

  it("rejects actions when no hand is running", () => {
    const { r, ids } = table(t);
    expectRoomError(() => rules.act(r, t.ctx, ids[0]!, { type: "fold" }, "a"), "NO_HAND");
  });

  it("pays out, waits between hands, then deals the next hand with the button moved", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    expect(r.buttonSeat).toBe(0);
    r = go(r, { type: "fold" });
    r = go(r, { type: "fold" }); // big blind wins
    expect(r.hand!.street).toBe("complete");
    expect(r.players.map((p) => p.stack)).toEqual([1000, 990, 1010]);
    expect(r.nextHandAt).toBe(T0 + HAND_PAUSE_MS);
    expect(r.turnDeadline).toBeNull();

    t.now = T0 + HAND_PAUSE_MS - 1;
    expect(JSON.stringify(rules.tick(r, t.ctx))).toBe(JSON.stringify(r));
    t.now = T0 + HAND_PAUSE_MS;
    r = rules.tick(r, t.ctx);
    expect(r.hand!.handNumber).toBe(2);
    expect(r.buttonSeat).toBe(1);
    expectChipsConserved(r);
  });
});

describe("turn timer", () => {
  it("folds when facing a bet, checks when free, only after the deadline", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    t.now = T0 + 29_999;
    expect(JSON.stringify(rules.tick(r, t.ctx))).toBe(JSON.stringify(r));
    t.now = T0 + 30_000;
    r = rules.tick(r, t.ctx);
    expect(r.hand!.players[0]!.folded).toBe(true);
    r = go(r, { type: "call" }); // small blind completes
    t.now += 30_000;
    r = rules.tick(r, t.ctx); // big blind times out with a free check
    expect(r.hand!.street).toBe("flop");
    expect(r.hand!.log.at(-1)).toMatchObject({ playerId: ids[2], type: "check" });
  });
});

describe("away, standing up, kicking", () => {
  it("away players are auto-acted on their turn and not dealt into new hands", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    r = rules.setAway(r, t.ctx, ids[0]!, ids[0]!, true); // their own turn: auto fold
    expect(r.hand!.players[0]!.folded).toBe(true);
    expect(turnId(r)).toBe(ids[1]);
    r = go(r, { type: "fold" });
    t.now += HAND_PAUSE_MS;
    r = rules.tick(r, t.ctx);
    expect(r.hand!.players.map((p) => p.id)).toEqual([ids[1], ids[2]]);
  });

  it("only the host can set someone else away", () => {
    const { r, ids } = table(t);
    expectRoomError(() => rules.setAway(r, t.ctx, ids[1]!, ids[2]!, true), "FORBIDDEN");
    expect(rules.setAway(r, t.ctx, ids[0]!, ids[2]!, true).players[2]!.away).toBe(true);
  });

  it("standing up mid-hand folds on turn and frees the seat when the hand ends", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    r = rules.stand(r, t.ctx, ids[1]!); // not their turn yet
    expect(r.players[1]).toMatchObject({ seat: 1, leaving: true });
    r = go(r, { type: "call" }); // button calls, then small blind auto-folds
    expect(r.hand!.players[1]!.folded).toBe(true);
    expect(turnId(r)).toBe(ids[2]);
    r = go(r, { type: "check" });
    for (let i = 0; i < 3; i++) r = go(go(r, { type: "check" }), { type: "check" });
    expect(r.hand!.street).toBe("complete");
    expect(r.players[1]).toMatchObject({ seat: null, leaving: false, stack: 990 });
    expectChipsConserved(r);
  });

  it("kicked player is folded, removed after the hand, and cannot rejoin", () => {
    let { r, ids } = table(t);
    expectRoomError(() => rules.kick(r, t.ctx, ids[1]!, ids[2]!), "FORBIDDEN");
    expectRoomError(() => rules.kick(r, t.ctx, ids[0]!, ids[0]!), "INVALID");
    r = rules.startGame(r, t.ctx, ids[0]!);
    r = rules.kick(r, t.ctx, ids[0]!, ids[2]!);
    r = go(r, { type: "call" });
    r = go(r, { type: "call" }); // then the big blind is auto-folded
    expect(r.hand!.players[2]!.folded).toBe(true);
    for (let i = 0; i < 3; i++) r = go(go(r, { type: "check" }), { type: "check" });
    expect(r.players[2]).toMatchObject({ seat: null, banned: true });
    expect(roomViewFor(r, ids[0]!, t.now).players.map((p) => p.id)).toEqual([ids[0], ids[1]]);
    expectRoomError(() => rules.join(r, t.ctx, { name: "Cy2", tokenHash: "hash-Cy" }), "BANNED");
    expectRoomError(() => rules.sit(r, t.ctx, ids[2]!, 5), "UNAUTHORIZED");
    expectChipsConserved(r);
  });

  it("host can be transferred", () => {
    let { r, ids } = table(t);
    r = rules.transferHost(r, t.ctx, ids[0]!, ids[1]!);
    expect(r.hostId).toBe(ids[1]);
    expectRoomError(() => rules.transferHost(r, t.ctx, ids[0]!, ids[2]!), "FORBIDDEN");
  });
});

describe("elimination and end of game", () => {
  function bustBo() {
    let { r, ids } = table(t, ["Ann", "Bo"]);
    t.rig([AA, KK], DRY);
    r = rules.startGame(r, t.ctx, ids[0]!);
    r = go(r, { type: "raise", to: 1000 });
    r = go(r, { type: "call" });
    expect(r.players.map((p) => p.stack)).toEqual([2000, 0]);
    return { r, ids };
  }

  it("out of chips is out; one player left means the game is over", () => {
    const { r, ids } = bustBo();
    expect(r.status).toBe("finished");
    expect(r.winnerId).toBe(ids[0]);
    expect(r.nextHandAt).toBeNull();
    t.now += HAND_PAUSE_MS * 10;
    expect(rules.tick(r, t.ctx).hand!.handNumber).toBe(1); // no new hand
    const view = roomViewFor(r, ids[1]!, t.now);
    expect(view.standings).toEqual([
      { playerId: ids[0], name: "Ann", place: 1 },
      { playerId: ids[1], name: "Bo", place: 2 },
    ]);
    expect(view.me!.out).toBe(true);
    expectRoomError(() => rules.startGame(r, t.ctx, ids[0]!), "INVALID");
    expectChipsConserved(r);
  });

  it("with 3 players a busted player sits out and the others play on", () => {
    let { r, ids } = table(t);
    t.rig([["2d", "3h"], KK, AA], DRY);
    r = rules.startGame(r, t.ctx, ids[0]!);
    r = go(r, { type: "fold" });
    r = go(r, { type: "raise", to: 1000 });
    r = go(r, { type: "call" });
    expect(r.status).toBe("playing");
    expect(r.players[1]!.stack).toBe(0);
    expect(roomViewFor(r, ids[1]!, t.now).me!.out).toBe(true);
    t.now += HAND_PAUSE_MS;
    r = rules.tick(r, t.ctx);
    expect(r.hand!.players.map((p) => p.id)).toEqual([ids[0], ids[2]]);
  });

  it("players busted in the same hand share a place", () => {
    let { r, ids } = table(t);
    t.rig([AA, KK, QQ], DRY);
    r = rules.startGame(r, t.ctx, ids[0]!);
    r = go(r, { type: "raise", to: 1000 });
    r = go(r, { type: "call" });
    r = go(r, { type: "call" });
    expect(r.status).toBe("finished");
    expect(roomViewFor(r, null, t.now).standings.map((s) => s.place)).toEqual([1, 2, 2]);
  });

  it("host can play again: everyone gets the starting chips back", () => {
    let { r, ids } = bustBo();
    expectRoomError(() => rules.playAgain(r, t.ctx, ids[1]!), "FORBIDDEN");
    r = rules.playAgain(r, t.ctx, ids[0]!);
    expect(r.status).toBe("playing");
    expect(r.hand!.handNumber).toBe(2);
    expect(r.chipsIssued).toBe(2000);
    expect(roomViewFor(r, ids[0]!, t.now).standings).toEqual([]);
    expectChipsConserved(r);
    expectRoomError(() => rules.playAgain(r, t.ctx, ids[0]!), "INVALID"); // not over
  });

  it("host can close the table; after that nothing changes", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    expectRoomError(() => rules.closeRoom(r, t.ctx, ids[1]!), "FORBIDDEN");
    r = rules.closeRoom(r, t.ctx, ids[0]!);
    expect(r.status).toBe("closed");
    expectRoomError(() => rules.act(r, t.ctx, ids[0]!, { type: "fold" }, "z"), "CLOSED");
    expectRoomError(() => rules.sendChat(r, t.ctx, ids[1]!, "hi"), "CLOSED");
    expectRoomError(() => rules.join(r, t.ctx, { name: "Dee", tokenHash: "d" }), "CLOSED");
    expect(rules.join(r, t.ctx, { name: "x", tokenHash: "hash-Bo" }).playerId).toBe(ids[1]); // can still look
    t.now += 60_000;
    expect(rules.tick(r, t.ctx)).toBe(r);
  });
});

describe("pause", () => {
  it("finishes the current hand, then waits until resumed", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    r = rules.setPaused(r, t.ctx, ids[0]!, true);
    r = go(go(r, { type: "fold" }), { type: "fold" });
    t.now += HAND_PAUSE_MS * 10;
    r = rules.tick(r, t.ctx);
    expect(r.hand!.handNumber).toBe(1);
    expectRoomError(() => rules.setPaused(r, t.ctx, ids[1]!, false), "FORBIDDEN");
    r = rules.setPaused(r, t.ctx, ids[0]!, false);
    expect(r.hand!.handNumber).toBe(2);
  });
});

describe("purity", () => {
  it("room functions never modify their input", () => {
    const { r, ids } = table(t);
    const before = JSON.stringify(r);
    rules.startGame(r, t.ctx, ids[0]!);
    rules.stand(r, t.ctx, ids[1]!);
    rules.kick(r, t.ctx, ids[0]!, ids[1]!);
    rules.join(r, t.ctx, { name: "Dee", tokenHash: "d" });
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe("chat", () => {
  it("cleans text, keeps the last 50 messages, and rate-limits each player", () => {
    let { r, ids } = table(t);
    r = rules.sendChat(r, t.ctx, ids[0]!, "  hi\n\tall 👋  ");
    expect(r.chat!.at(-1)).toMatchObject({ playerId: ids[0], name: "Ann", text: "hi all 👋" });
    expectRoomError(() => rules.sendChat(r, t.ctx, ids[0]!, "again"), "RATE_LIMITED");
    r = rules.sendChat(r, t.ctx, ids[1]!, "yo"); // another player is not limited
    expectRoomError(() => rules.sendChat(r, t.ctx, ids[2]!, "   "), "INVALID");
    expectRoomError(() => rules.sendChat(r, t.ctx, ids[2]!, "x".repeat(201)), "INVALID");
    expectRoomError(() => rules.sendChat(r, t.ctx, "ghost", "hi"), "UNAUTHORIZED");
    for (let i = 0; i < 60; i++) {
      t.now += 1000;
      r = rules.sendChat(r, t.ctx, ids[0]!, `m${i}`);
    }
    expect(r.chat).toHaveLength(50);
    expect(r.chat!.at(-1)!.text).toBe("m59");
    const view = roomViewFor(r, ids[1]!, t.now);
    expect(view.chat).toHaveLength(50);
    expect(JSON.stringify(view)).not.toContain("lastChatAt");
  });
});

describe("nobody home: missed turns", () => {
  /** Let the timer run out for whoever is to act. */
  function timeout(r: RoomState): RoomState {
    t.now = r.turnDeadline!;
    return rules.tick(r, t.ctx);
  }

  it("two missed turns in a row sit the player out", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    r = timeout(r); // Ann (first to act) misses once and folds
    expect(r.players[0]).toMatchObject({ missedTurns: 1, away: false });
    // Play the rest of the hand by hand, then the next hand until it's Ann's turn again.
    for (let i = 0; i < 50 && turnId(r) !== ids[0]; i++) {
      if (!rules.activeHand(r)) {
        t.now = r.nextHandAt!;
        r = rules.tick(r, t.ctx);
        continue;
      }
      const h = rules.activeHand(r)!;
      r = go(r, h.currentBet > h.players[h.toAct!]!.bet ? { type: "call" } : { type: "check" });
    }
    expect(turnId(r)).toBe(ids[0]);
    r = timeout(r);
    expect(r.players[0]).toMatchObject({ away: true, missedTurns: 0 });
  });

  it("acting yourself resets the count", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    r = rules.setAway(r, t.ctx, ids[0]!, ids[0]!, false);
    r = go(r, { type: "call" });
    expect(r.players[0]!.missedTurns).toBe(0);
  });

  it("a table nobody touches stops by itself", () => {
    let { r, ids } = table(t, ["Ann", "Bo"]);
    r = rules.startGame(r, t.ctx, ids[0]!);
    for (let i = 0; i < 40; i++) {
      if (r.turnDeadline) t.now = r.turnDeadline;
      else if (r.nextHandAt) t.now = r.nextHandAt;
      r = rules.tick(r, t.ctx);
    }
    // One player sitting out is enough: fewer than 2 active players means no new hands.
    expect(r.players.some((p) => p.away)).toBe(true);
    expect(r.hand!.handNumber).toBeLessThanOrEqual(4);
    expect(rules.activeHand(r)).toBeNull();
    expect(r.turnDeadline).toBeNull();
  });
});

describe("hand history", () => {
  it("keeps the last 20 hands without the deck", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    for (let i = 0; i < 25; i++) {
      r = go(go(r, { type: "fold" }), { type: "fold" });
      t.now = r.nextHandAt!;
      r = rules.tick(r, t.ctx);
    }
    expect(r.history).toHaveLength(20);
    expect(r.history!.at(-1)!.hand.handNumber).toBe(25);
    expect(r.history!.every((h) => h.hand.deck.length === 0)).toBe(true);
    const items = historyFor(r, ids[0]!);
    expect(items[0]!.handNumber).toBe(25); // newest first
    expect(items[0]!.names[ids[1]!]).toBe("Bo");
  });

  it("shows your own cards and showdown cards, never other hidden cards", () => {
    let { r, ids } = table(t);
    r = rules.startGame(r, t.ctx, ids[0]!);
    // Hand 1: everyone folds to the big blind, no showdown.
    r = go(go(r, { type: "fold" }), { type: "fold" });
    const hand1 = r.history!.at(-1)!.hand;
    const annView = JSON.stringify(historyFor(r, ids[0]!));
    for (const c of hand1.players[0]!.hole) expect(annView).toContain(`"${c}"`);
    for (const p of hand1.players.slice(1)) for (const c of p.hole) expect(annView).not.toContain(`"${c}"`);
    // Hand 2: a showdown; the shown cards are visible to everyone.
    t.now = r.nextHandAt!;
    r = rules.tick(r, t.ctx);
    r = go(r, { type: "call" });
    r = go(r, { type: "call" });
    r = go(r, { type: "check" });
    for (let i = 0; i < 9 && rules.activeHand(r); i++) r = go(r, { type: "check" });
    const last = historyFor(r, ids[1]!)[0]!;
    expect(last.hand.result!.showdown).toBe(true);
    expect(last.hand.players.every((p) => p.hole !== null)).toBe(true);
  });
});

describe("avatars", () => {
  it("everyone gets a different random avatar and can pick another", () => {
    let { r, ids } = table(t);
    const avatars = r.players.map((p) => p.avatar);
    expect(new Set(avatars).size).toBe(3);
    expect(avatars.every((a) => (AVATARS as readonly string[]).includes(a!))).toBe(true);
    r = rules.setAvatar(r, t.ctx, ids[0]!, "🐳");
    expect(r.players[0]!.avatar).toBe("🐳");
    expectRoomError(() => rules.setAvatar(r, t.ctx, ids[0]!, "💩"), "INVALID");
    expect(roomViewFor(r, null, t.now).players[0]!.avatar).toBe("🐳");
  });
});
