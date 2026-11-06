import { describe, expect, it } from "vitest";
import { EngineError, legalActions, newDeck, type Action } from "../../engine";
import { shuffle } from "../../engine/random";
import { mulberry32 } from "../../engine/__tests__/helpers";
import * as rules from "../room";
import { RoomError, type RoomCtx, type RoomState } from "../types";
import { roomViewFor } from "../view";

/**
 * Random sessions: people join, sit, stand, go away, get kicked, bust and rebuy,
 * time out, and play random hands. After every step the room must hold exactly
 * the chips it ever issued, and no client view may contain hidden cards or tokens.
 */
describe("room random sessions", () => {
  it("chips are conserved and nothing secret leaks", () => {
    const rand = mulberry32(42);
    const int = (n: number) => Math.floor(rand() * n);
    let now = 0;
    let idn = 0;
    const ctx = (): RoomCtx => ({
      now,
      newDeck: () => shuffle(newDeck(), int),
      newId: () => `u${++idn}`,
    });

    let finishedSeen = 0;
    for (let session = 0; session < 60; session++) {
      let r: RoomState = rules.createRoom(ctx(), { code: "ROOM", hostName: "H", tokenHash: "tok-H" }).room;
      for (let i = 0; i < 2 + int(7); i++) r = rules.join(r, ctx(), { name: `N${i}`, tokenHash: `tok-${i}` }).room;
      r.players.forEach((p, seat) => (r = rules.sit(r, ctx(), p.id, seat)));
      r = rules.startGame(r, ctx(), r.hostId);

      for (let step = 0; step < 400; step++) {
        if (r.status === "finished") finishedSeen++;
        now += int(3) === 0 ? 31_000 : 500;
        const members = r.players.filter((p) => !p.banned);
        const someone = members[int(members.length)]!;
        const roll = rand();
        try {
          if (roll < 0.6 && rules.activeHand(r)) {
            const legal = legalActions(r.hand!)!;
            const pick = rand();
            let a: Action = legal.canCheck ? { type: "check" } : { type: "call" };
            if (pick < 0.15) a = { type: "fold" };
            else if (pick < 0.35 && legal.canRaise)
              a = { type: "raise", to: legal.minRaiseTo + int(legal.maxRaiseTo - legal.minRaiseTo + 1) };
            r = rules.act(r, ctx(), legal.playerId, a, `s${session}-${step}`);
          } else if (roll < 0.75) r = rules.tick(r, ctx());
          else if (roll < 0.8) r = rules.setAway(r, ctx(), someone.id, someone.id, !someone.away);
          else if (roll < 0.84) r = rules.stand(r, ctx(), someone.id);
          else if (roll < 0.88) r = rules.sit(r, ctx(), someone.id, int(9));
          else if (roll < 0.96) {
            if (r.status === "finished") r = rules.playAgain(r, ctx(), r.hostId);
          } else if (roll < 0.97) r = rules.kick(r, ctx(), r.hostId, someone.id);
          else if (roll < 0.99) r = rules.setPaused(r, ctx(), r.hostId, !r.paused);
          else r = rules.transferHost(r, ctx(), r.hostId, someone.id);
        } catch (e) {
          // Rejected requests are fine; anything else is a bug.
          if (!(e instanceof RoomError) && !(e instanceof EngineError)) throw e;
        }

        expect(rules.roomChipTotal(r)).toBe(r.chipsIssued);
        for (const p of r.players) expect(p.stack).toBeGreaterThanOrEqual(0);
        const seats = r.players.filter((p) => p.seat !== null).map((p) => p.seat);
        expect(new Set(seats).size).toBe(seats.length);
        if (step % 10 === 0) checkView(r, someone.id, now);
      }
    }
    expect(finishedSeen, "some games should reach the end").toBeGreaterThan(0);
  });
});

function checkView(r: RoomState, viewerId: string, now: number) {
  const json = JSON.stringify(roomViewFor(r, viewerId, now));
  for (const p of r.players) expect(json).not.toContain(p.tokenHash);
  if (!r.hand) return;
  const visible = new Set(r.hand.board);
  for (const p of r.hand.players)
    if (p.id === viewerId || (r.hand.result?.showdown && r.hand.result.hands[p.id]))
      p.hole.forEach((c) => visible.add(c));
  for (const c of newDeck()) if (!visible.has(c)) expect(json.includes(`"${c}"`)).toBe(false);
}
