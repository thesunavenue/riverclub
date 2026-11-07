import { beforeEach, describe, expect, it } from "vitest";
import { newDeck } from "../../engine";
import { RoomService } from "../../room/service";
import { MemoryRoomStore } from "../../room/store";
import { tableSoundEvents } from "../tableSoundEvents";

let now = 1_000_000;
let service: RoomService;
let store: MemoryRoomStore;

beforeEach(() => {
  now = 1_000_000;
  store = new MemoryRoomStore();
  service = new RoomService({ store, now: () => now, newDeck: () => newDeck() });
});

async function threePlaying() {
  const host = await service.createRoom({ hostName: "Ann" });
  const code = host.view.code;
  await service.sit(code, host.token, 0);
  const bo = await service.join(code, { name: "Bo", autoSit: true });
  const cy = await service.join(code, { name: "Cy", autoSit: true });
  await service.startGame(code, host.token);
  const all = [host, bo, cy];
  const toAct = async () => {
    const raw = (await store.get(code))!;
    const id = raw.hand!.players[raw.hand!.toAct!]!.id;
    return all.find((p) => p.playerId === id)!;
  };
  return { code, all, toAct };
}

describe("applause on the winner's device only", () => {
  it("everyone folds to the last player: only that player's view cheers", async () => {
    const { code, all, toAct } = await threePlaying();
    const before = await Promise.all(all.map((p) => service.view(code, p.token)));
    const p1 = await toAct();
    await service.act(code, p1.token, { type: "fold" }, "a1");
    const mid = await Promise.all(all.map((p) => service.view(code, p.token)));
    const p2 = await toAct();
    await service.act(code, p2.token, { type: "fold" }, "a2");
    const after = await Promise.all(all.map((p) => service.view(code, p.token)));
    const winner = all.find((p) => p !== p1 && p !== p2)!;

    all.forEach((p, i) => {
      const ev = tableSoundEvents(mid[i]!, after[i]!)!;
      if (p === winner) expect(ev.winInMs).toBeGreaterThan(0);
      else expect(ev.winInMs).toBeNull();
      // no cheering before the hand ends
      expect(tableSoundEvents(before[i]!, mid[i]!)!.winInMs).toBeNull();
      // and only once: the same finished view again does not cheer
      expect(tableSoundEvents(after[i]!, after[i]!)!.winInMs).toBeNull();
    });
  });

  it("showdown: the winner's view cheers and waits for the board reveal", async () => {
    const { code, all, toAct } = await threePlaying();
    let prev = await Promise.all(all.map((p) => service.view(code, p.token)));
    let views = prev;
    for (let i = 0; i < 30; i++) {
      const raw = (await store.get(code))!;
      if (raw.hand!.street === "complete") break;
      const p = await toAct();
      const legal = (await service.view(code, p.token)).hand!.legal!;
      await service.act(code, p.token, legal.canCheck ? { type: "check" } : { type: "call" }, `s${i}`);
      prev = views;
      views = await Promise.all(all.map((x) => service.view(code, x.token)));
    }
    const result = views[0]!.hand!.result!;
    expect(result.showdown).toBe(true);
    const winners = new Set(result.pots.flatMap((p) => p.winners));
    all.forEach((p, i) => {
      const ev = tableSoundEvents(prev[i]!, views[i]!)!;
      const net = (result.payouts[p.playerId] ?? 0) - views[i]!.hand!.players.find((x) => x.id === p.playerId)!.committed;
      if (winners.has(p.playerId) && net > 0) expect(ev.winInMs).toBeGreaterThan(0);
      else expect(ev.winInMs).toBeNull();
    });
  });

  it("a spectator never cheers", async () => {
    const { code, toAct } = await threePlaying();
    const a = await service.view(code, null);
    const p1 = await toAct();
    await service.act(code, p1.token, { type: "fold" }, "x1");
    const p2 = await toAct();
    await service.act(code, p2.token, { type: "fold" }, "x2");
    expect(tableSoundEvents(a, await service.view(code, null))!.winInMs).toBeNull();
  });
});
