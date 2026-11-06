import { beforeEach, describe, expect, it } from "vitest";
import { newDeck } from "../../engine";
import { RoomService } from "../../room/service";
import { MemoryRoomStore } from "../../room/store";
import { createHandlers, MAX_BODY_BYTES, type Handlers } from "../handlers";
import { RateLimiter } from "../rate-limit";

let store: MemoryRoomStore;
let h: Handlers;

beforeEach(() => {
  store = new MemoryRoomStore();
  const service = new RoomService({ store, newDeck: () => newDeck() });
  h = createHandlers(() => service, { createLimiter: new RateLimiter(3, 60_000) });
});

function req(method: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { ...headers } };
  if (token) (init.headers as Record<string, string>).authorization = `Bearer ${token}`;
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api", init);
}

async function call(p: Promise<Response>) {
  const res = await p;
  return { status: res.status, body: (await res.json()) as any, headers: res.headers };
}

async function setup() {
  const host = await call(h.createRoom(req("POST", { hostName: "Ann" })));
  expect(host.status).toBe(201);
  const code: string = host.body.code;
  const bo = await call(h.joinRoom(req("POST", { name: "Bo" }), code));
  const cy = await call(h.joinRoom(req("POST", { name: "Cy" }), code));
  for (const [p, seat] of [[host, 0], [bo, 1], [cy, 2]] as const) {
    const r = await call(h.command(req("POST", { cmd: "sit", seat }, p.body.token), code));
    expect(r.status).toBe(200);
  }
  return { code, host: host.body, bo: bo.body, cy: cy.body };
}

describe("room API handlers", () => {
  it("create → join → sit → start → act", async () => {
    const { code, host, bo } = await setup();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    let r = await call(h.command(req("POST", { cmd: "startGame" }, host.token), code));
    expect(r.status).toBe(200);
    expect(r.body.view.hand.handNumber).toBe(1);
    expect(r.body.view.hand.toActId).toBe(host.playerId); // 3-handed: button first
    r = await call(
      h.command(req("POST", { cmd: "act", action: { type: "raise", to: 60 }, actionId: "a1" }, host.token), code),
    );
    expect(r.status).toBe(200);
    expect(r.body.view.hand.toActId).toBe(bo.playerId);
    expect(r.headers.get("cache-control")).toBe("no-store");

    // Out of turn → 409, engine error shape.
    r = await call(h.command(req("POST", { cmd: "act", action: { type: "fold" }, actionId: "a2" }, host.token), code));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("NOT_YOUR_TURN");
  });

  it("reconnect with the saved token returns the same player and seat", async () => {
    const { code, bo } = await setup();
    const r = await call(h.joinRoom(req("POST", { name: "Bo" }, bo.token), code));
    expect(r.body.playerId).toBe(bo.playerId);
    expect(r.body.view.me.seat).toBe(1);
  });

  it("missing or wrong token → 401", async () => {
    const { code } = await setup();
    let r = await call(h.command(req("POST", { cmd: "stand" }), code));
    expect(r.status).toBe(401);
    r = await call(h.command(req("POST", { cmd: "stand" }, "x".repeat(43)), code));
    expect(r.status).toBe(401);
    r = await call(h.command(req("POST", { cmd: "stand" }, undefined, { authorization: "Basic abc" }), code));
    expect(r.status).toBe(401);
    r = await call(h.getRoom(req("GET", undefined, "bad token!"), code));
    expect(r.status).toBe(401);
  });

  it("bad JSON, non-object JSON and oversized bodies → 400", async () => {
    const { code, host } = await setup();
    let r = await call(h.command(req("POST", "{not json", host.token), code));
    expect([r.status, r.body.error.code]).toEqual([400, "BAD_JSON"]);
    r = await call(h.command(req("POST", "[1,2]", host.token), code));
    expect(r.status).toBe(400);
    r = await call(h.createRoom(req("POST", { hostName: "A", pad: "x".repeat(MAX_BODY_BYTES) })));
    expect([r.status, r.body.error.code]).toEqual([400, "TOO_LARGE"]);
  });

  it("validates commands and arguments", async () => {
    const { code, host } = await setup();
    const bad = [
      { cmd: "dance" },
      { cmd: "sit", seat: "1" },
      { cmd: "setPaused", paused: "yes" },
      { cmd: "act", action: { type: "raise", to: 12.5 }, actionId: "x" },
      { cmd: "act", action: { type: "allin" }, actionId: "x" },
      { cmd: "act", action: { type: "fold" } },
      { cmd: "kick", targetId: "" },
      { cmd: "transferHost" },
      { cmd: "answerRebuy", targetId: "abc" }, // removed command
    ];
    for (const body of bad) {
      const r = await call(h.command(req("POST", body, host.token), code));
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    const r = await call(h.createRoom(req("POST", { hostName: "A", settings: { bigBlind: "20" } })));
    expect(r.status).toBe(400);
  });

  it("unknown or malformed room codes → 404", async () => {
    let r = await call(h.getRoom(req("GET"), "ZZZZZZ"));
    expect(r.status).toBe(404);
    r = await call(h.getRoom(req("GET"), "../../etc"));
    expect(r.status).toBe(404);
  });

  it("host-only commands → 403 for others", async () => {
    const { code, bo } = await setup();
    const r = await call(h.command(req("POST", { cmd: "startGame" }, bo.token), code));
    expect([r.status, r.body.error.code]).toEqual([403, "FORBIDDEN"]);
  });

  it("rate-limits room creation per IP → 429", async () => {
    const ip = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" };
    for (let i = 0; i < 3; i++) {
      const r = await call(h.createRoom(req("POST", { hostName: `H${i}` }, undefined, ip)));
      expect(r.status).toBe(201);
    }
    const r = await call(h.createRoom(req("POST", { hostName: "H4" }, undefined, ip)));
    expect([r.status, r.body.error.code]).toEqual([429, "RATE_LIMITED"]);
    const other = await call(h.createRoom(req("POST", { hostName: "H5" }, undefined, { "x-forwarded-for": "198.51.100.1" })));
    expect(other.status).toBe(201);
  });

  it("a player's view never contains other players' hole cards or any token data", async () => {
    const { code, host, bo, cy } = await setup();
    await call(h.command(req("POST", { cmd: "startGame" }, host.token), code));
    const raw = (await store.get(code))!;
    const secrets = raw.players.map((p) => p.tokenHash);
    for (const viewer of [host, bo, cy, null]) {
      const r = await call(h.getRoom(req("GET", undefined, viewer?.token), code));
      const text = JSON.stringify(r.body);
      for (const s of secrets) expect(text).not.toContain(s);
      for (const p of raw.hand!.players) {
        if (viewer && p.id === viewer.playerId) continue;
        for (const c of p.hole) expect(text).not.toContain(`"${c}"`);
      }
      for (const c of raw.hand!.deck) expect(text).not.toContain(`"${c}"`);
      for (const t of [host, bo, cy]) if (t !== viewer) expect(text).not.toContain(t.token);
    }
  });

  it("unexpected errors return a generic 500 without details", async () => {
    const broken = createHandlers(() => {
      throw new Error("db password is hunter2");
    });
    const r = await call(broken.getRoom(req("GET"), "ABCDEF"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("hunter2");
  });
});

describe("route wiring", () => {
  it("POST /api/rooms route creates a room using the default (memory) store", async () => {
    const { POST } = await import("@/app/api/rooms/route");
    const res = await POST(req("POST", { hostName: "Ann" }, undefined, { "x-forwarded-for": "192.0.2.50" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    const { GET } = await import("@/app/api/rooms/[code]/route");
    const view = await GET(req("GET", undefined, body.token), { params: Promise.resolve({ code: body.code }) });
    expect(((await view.json()) as any).view.me.name).toBe("Ann");
  });
});
