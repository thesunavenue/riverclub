/**
 * Runs against the real Supabase project in .env.local. Opt-in only:
 *   npm run test:supabase
 * Creates a few test rooms and deletes them afterwards.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RoomService } from "../service";
import { SupabaseRoomStore } from "../store-supabase";
import { RoomError } from "../types";

const RUN = process.env.RUN_SUPABASE_IT === "1";
if (RUN && existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

describe.runIf(RUN)("Supabase room store (real database)", () => {
  let admin: SupabaseClient;
  let store: SupabaseRoomStore;
  let service: RoomService;
  const codes: string[] = [];

  beforeAll(() => {
    expect(url && secretKey && publishableKey, "fill .env.local").toBeTruthy();
    admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    store = new SupabaseRoomStore(admin);
    service = new RoomService({ store });
  });

  afterAll(async () => {
    if (codes.length) await admin.from("rooms").delete().in("code", codes);
  });

  async function newRoom() {
    const host = await service.createRoom({ hostName: "Ann" });
    codes.push(host.view.code);
    return host;
  }

  it("creates, joins, seats, starts and plays an action", async () => {
    const host = await newRoom();
    const code = host.view.code;
    const bo = await service.join(code, { name: "Bo" });
    await service.sit(code, host.token, 0);
    await service.sit(code, bo.token, 1);
    const started = await service.startGame(code, host.token);
    expect(started.hand!.handNumber).toBe(1);
    const after = await service.act(code, host.token, { type: "call" }, "it-1");
    expect(after.version).toBe(started.version + 1);
    // Reload from the database: same state.
    const reread = await service.view(code, bo.token);
    expect(reread.version).toBe(after.version);
    expect(reread.me!.seat).toBe(1);
  });

  it("insert refuses a duplicate room code", async () => {
    const host = await newRoom();
    const room = (await store.get(host.view.code))!;
    expect(await store.insert(room)).toBe(false);
  });

  it("compare-and-swap: concurrent joins all land, a seat race has one winner", async () => {
    const host = await newRoom();
    const code = host.view.code;
    const players = await Promise.all(["Bo", "Cy", "Dee"].map((name) => service.join(code, { name })));
    const room = (await store.get(code))!;
    expect(room.players).toHaveLength(4);
    const race = await Promise.allSettled(players.map((p) => service.sit(code, p.token, 5)));
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of race)
      if (r.status === "rejected") expect((r.reason as RoomError).code).toBe("SEAT_TAKEN");
    expect(await store.update(room, room.version)).toBe(false); // stale version
  });

  it("the publishable (browser) key cannot read or write rooms", async () => {
    const host = await newRoom();
    const browser = createClient(url, publishableKey, { auth: { persistSession: false } });
    const read = await browser.from("rooms").select("*").eq("code", host.view.code);
    expect(read.data ?? []).toHaveLength(0);
    const write = await browser.from("rooms").update({ version: 999 }).eq("code", host.view.code).select();
    expect(write.data ?? []).toHaveLength(0);
    const stillThere = (await store.get(host.view.code))!;
    expect(stillThere.version).not.toBe(999);
  });

  it("realtime broadcast endpoint accepts the secret key", async () => {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: secretKey },
      body: JSON.stringify({ messages: [{ topic: "room:TEST00", event: "version", payload: { code: "TEST00", version: 1 } }] }),
    });
    expect(res.status, await res.text()).toBeLessThan(300);
  });
});
