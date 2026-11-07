import { beforeEach, describe, expect, it } from "vitest";
import { newDeck } from "../../engine";
import { hashToken, isRoomCode, newRoomCode } from "../secrets";
import { RoomService } from "../service";
import { MemoryRoomStore } from "../store";
import { RoomError } from "../types";

let now = 1_000_000;
let changes: unknown[][] = [];
let service: RoomService;
let store: MemoryRoomStore;

beforeEach(() => {
  now = 1_000_000;
  changes = [];
  store = new MemoryRoomStore();
  service = new RoomService({
    store,
    now: () => now,
    newDeck: () => newDeck(),
    onChange: (...args) => {
      changes.push(args);
    },
  });
});

async function expectRoomError(p: Promise<unknown>, code: RoomError["code"]) {
  await expect(p).rejects.toBeInstanceOf(RoomError);
  await p.catch((e: RoomError) => expect(e.code).toBe(code));
}

async function threeSeated() {
  const host = await service.createRoom({ hostName: "Ann" });
  const code = host.view.code;
  const bo = await service.join(code, { name: "Bo" });
  const cy = await service.join(code, { name: "Cy" });
  await service.sit(code, host.token, 0);
  await service.sit(code, bo.token, 1);
  await service.sit(code, cy.token, 2);
  return { code, host, bo, cy };
}

describe("RoomService", () => {
  it("creates a room with a short readable code and a secret guest token", async () => {
    const res = await service.createRoom({ hostName: "Ann" });
    expect(isRoomCode(res.view.code)).toBe(true);
    expect(res.token.length).toBeGreaterThanOrEqual(40);
    expect(res.view.me).toMatchObject({ name: "Ann", isHost: true });
    const saved = await store.get(res.view.code);
    expect(saved!.players[0]!.tokenHash).toBe(hashToken(res.token));
    expect(JSON.stringify(saved)).not.toContain(res.token); // only the hash is stored
  });

  it("room codes avoid look-alike characters", () => {
    for (let i = 0; i < 200; i++) expect(newRoomCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });

  it("reconnect with the saved token returns the same seat; unknown tokens get a new player", async () => {
    const { code, bo } = await threeSeated();
    const again = await service.join(code, { name: "ignored", token: bo.token });
    expect(again.playerId).toBe(bo.playerId);
    expect(again.token).toBe(bo.token);
    expect(again.view.me!.seat).toBe(1);
    const stranger = await service.join(code, { name: "Dee", token: "made-up" });
    expect(stranger.token).not.toBe("made-up");
    expect(stranger.playerId).not.toBe(bo.playerId);
  });

  it("rejects unknown tokens and missing rooms", async () => {
    const { code } = await threeSeated();
    await expectRoomError(service.sit(code, "nope", 4), "UNAUTHORIZED");
    await expectRoomError(service.view("ZZZZZZ", null), "NOT_FOUND");
  });

  it("concurrent requests are all applied (compare-and-swap with retry)", async () => {
    const host = await service.createRoom({ hostName: "Ann" });
    const code = host.view.code;
    const players = await Promise.all(["Bo", "Cy", "Dee", "Eve"].map((name) => service.join(code, { name })));
    await Promise.all(players.map((p, i) => service.sit(code, p.token, i + 1)));
    const room = (await store.get(code))!;
    expect(room.players.map((p) => p.seat)).toEqual([null, 1, 2, 3, 4]);
    expect(room.version).toBe(1 + 4 + 4);
  });

  it("two people racing for one seat: exactly one wins", async () => {
    const host = await service.createRoom({ hostName: "Ann" });
    const code = host.view.code;
    const bo = await service.join(code, { name: "Bo" });
    const results = await Promise.allSettled([service.sit(code, host.token, 3), service.sit(code, bo.token, 3)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((failed.reason as RoomError).code).toBe("SEAT_TAKEN");
  });

  it("a resent action is applied once", async () => {
    const { code, host } = await threeSeated();
    await service.startGame(code, host.token);
    const v1 = await service.act(code, host.token, { type: "call" }, "act-1");
    const v2 = await service.act(code, host.token, { type: "call" }, "act-1");
    expect(v2.version).toBe(v1.version);
    expect(v2.hand!.log.filter((e) => e.type === "call")).toHaveLength(1);
  });

  it("tick with nothing to do saves nothing; realtime only gets code and version", async () => {
    const { code, host } = await threeSeated();
    await service.startGame(code, host.token);
    const before = changes.length;
    const v = await service.tick(code, null);
    expect(changes.length).toBe(before);
    now += 30_000;
    const v2 = await service.tick(code, null);
    expect(v2.version).toBe(v.version + 1);
    expect(changes.at(-1)).toEqual([code, v2.version]);
    for (const c of changes) expect(c).toHaveLength(2);
  });

  it("each player only sees their own cards; spectators see none", async () => {
    const { code, host, bo } = await threeSeated();
    await service.startGame(code, host.token);
    const raw = (await store.get(code))!;
    const boCards = raw.hand!.players[1]!.hole;
    const annView = await service.view(code, host.token);
    const boView = await service.view(code, bo.token);
    const spectator = await service.view(code, null);
    expect(boView.hand!.players[1]!.hole).toEqual(boCards);
    for (const c of boCards) {
      expect(JSON.stringify(annView)).not.toContain(`"${c}"`);
      expect(JSON.stringify(spectator)).not.toContain(`"${c}"`);
    }
    expect(spectator.me).toBeNull();
    expect(spectator.hand!.players.every((p) => p.hole === null)).toBe(true);
  });

  it("kicked player's token stops working", async () => {
    const { code, host, cy } = await threeSeated();
    await service.kick(code, host.token, cy.playerId);
    await expectRoomError(service.view(code, cy.token), "BANNED");
    await expectRoomError(service.join(code, { name: "Cy", token: cy.token }), "BANNED");
  });
});

describe("cleanup", () => {
  it("creating a room deletes rooms idle for more than a day", async () => {
    const old = await service.createRoom({ hostName: "Old" });
    now += 25 * 60 * 60 * 1000;
    const fresh = await service.createRoom({ hostName: "New" });
    expect(await store.get(old.view.code)).toBeNull();
    expect(await store.get(fresh.view.code)).not.toBeNull();
  });

  it("a closed room is emptied at once and deleted a few minutes later", async () => {
    const { code, host } = await threeSeated();
    await service.startGame(code, host.token);
    await service.closeRoom(code, host.token);
    const closed = (await store.get(code))!;
    expect(closed.hand).toBeNull();
    expect(closed.history ?? []).toEqual([]);
    now += 5 * 60 * 1000;
    await service.createRoom({ hostName: "Other" });
    expect(await store.get(code)).not.toBeNull(); // friends still see "table closed"
    now += 6 * 60 * 1000;
    await service.createRoom({ hostName: "Another" });
    expect(await store.get(code)).toBeNull();
  });
});

describe("joining from an invite link", () => {
  it("autoSit puts each guest in a free seat, spread around the table", async () => {
    const host = await service.createRoom({ hostName: "Ann" });
    const code = host.view.code;
    await service.sit(code, host.token, 0);
    const bo = await service.join(code, { name: "Bo", autoSit: true });
    const cy = await service.join(code, { name: "Cy", autoSit: true });
    expect(bo.view.me!.seat).toBe(4);
    expect(cy.view.me!.seat).toBe(2);
    // reconnecting keeps the seat
    const again = await service.join(code, { name: "Bo", token: bo.token, autoSit: true });
    expect(again.view.me!.seat).toBe(4);
  });

  it("a guest joining mid-game is dealt in from the next hand", async () => {
    const { code, host } = await threeSeated();
    await service.startGame(code, host.token);
    const dee = await service.join(code, { name: "Dee", autoSit: true });
    expect(dee.view.me!.seat).not.toBeNull();
    expect(dee.view.hand!.players.some((p) => p.id === dee.playerId)).toBe(false);
    const raw = (await store.get(code))!;
    expect(raw.chipsIssued).toBe(4 * raw.settings.startingStack);
  });

  it("when all 9 seats are taken the guest watches", async () => {
    const host = await service.createRoom({ hostName: "P0" });
    const code = host.view.code;
    await service.sit(code, host.token, 0);
    for (let i = 1; i < 9; i++) await service.join(code, { name: `P${i}`, autoSit: true });
    const late = await service.join(code, { name: "Late", autoSit: true });
    expect(late.view.me!.seat).toBeNull();
  });
});
