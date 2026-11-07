/**
 * HTTP handlers for the room API, independent of Next.js so they can be unit-tested.
 * Route files in app/api/rooms only forward to these.
 *
 * Security rules:
 * - The guest token travels only in `Authorization: Bearer <token>`, never in URLs.
 * - All input is validated here before it reaches room logic.
 * - Errors return {error: {code, message}}; internal details never reach the client.
 */
import { EngineError, type Action } from "../engine";
import { isRoomCode } from "../room/secrets";
import type { RoomService } from "../room/service";
import { RoomError, type RoomSettings } from "../room/types";
import { RateLimiter } from "./rate-limit";

export const MAX_BODY_BYTES = 4096;

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const ROOM_STATUS: Record<RoomError["code"], number> = {
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BANNED: 403,
  INVALID: 400,
  SEAT_TAKEN: 409,
  ROOM_FULL: 409,
  NAME_TAKEN: 409,
  NOT_ENOUGH_PLAYERS: 409,
  NO_HAND: 409,
  RATE_LIMITED: 429,
  CLOSED: 410,
  CONFLICT: 409,
};

const ENGINE_STATUS: Record<EngineError["code"], number> = {
  INVALID_SETUP: 400,
  HAND_OVER: 409,
  NOT_YOUR_TURN: 409,
  ILLEGAL_ACTION: 400,
  INVALID_AMOUNT: 400,
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status);
  if (e instanceof RoomError)
    return json({ error: { code: e.code, message: e.message } }, ROOM_STATUS[e.code] ?? 400);
  if (e instanceof EngineError)
    return json({ error: { code: e.code, message: e.message } }, ENGINE_STATUS[e.code] ?? 400);
  console.error("[riverclub] unexpected error", e);
  return json({ error: { code: "INTERNAL", message: "Something went wrong" } }, 500);
}

// ---------- input helpers ----------

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new HttpError(400, "TOO_LARGE", "Request body too large");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES)
    throw new HttpError(400, "TOO_LARGE", "Request body too large");
  if (text.trim() === "") return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "BAD_JSON", "Body must be JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw new HttpError(400, "BAD_JSON", "Body must be a JSON object");
  return body as Record<string, unknown>;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

/** Guest token from the Authorization header, or null if absent. Malformed → 401. */
export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer (.+)$/.exec(h);
  if (!m || !TOKEN_RE.test(m[1]!)) throw new HttpError(401, "UNAUTHORIZED", "Invalid token");
  return m[1]!;
}

function requireToken(req: Request): string {
  const t = bearer(req);
  if (!t) throw new HttpError(401, "UNAUTHORIZED", "Missing token");
  return t;
}

function roomCode(code: string): string {
  const c = code.toUpperCase();
  if (!isRoomCode(c)) throw new RoomError("NOT_FOUND", "Room not found");
  return c;
}

function str(v: unknown, field: string, max: number): string {
  if (typeof v !== "string" || v.length < 1 || v.length > max)
    throw new HttpError(400, "INVALID", `${field} must be a string of 1 to ${max} characters`);
  return v;
}

function int(v: unknown, field: string): number {
  if (!Number.isInteger(v)) throw new HttpError(400, "INVALID", `${field} must be an integer`);
  return v as number;
}

function bool(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") throw new HttpError(400, "INVALID", `${field} must be true or false`);
  return v;
}

function settings(v: unknown): Partial<RoomSettings> | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "INVALID", "settings must be an object");
  const s = v as Record<string, unknown>;
  const out: Partial<RoomSettings> = {};
  for (const key of ["startingStack", "smallBlind", "bigBlind", "turnSeconds"] as const) {
    if (s[key] !== undefined) out[key] = int(s[key], key);
  }
  return out;
}

function action(v: unknown): Action {
  if (typeof v !== "object" || v === null) throw new HttpError(400, "INVALID", "action must be an object");
  const a = v as Record<string, unknown>;
  switch (a.type) {
    case "fold":
    case "check":
    case "call":
      return { type: a.type };
    case "raise":
      return { type: "raise", to: int(a.to, "action.to") };
    default:
      throw new HttpError(400, "INVALID", "Unknown action type");
  }
}

/** Client IP for rate limiting. On Vercel, x-forwarded-for is set by the platform. */
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// ---------- handlers ----------

export interface HandlerOptions {
  createLimiter?: RateLimiter;
}

export function createHandlers(getService: () => RoomService, opts: HandlerOptions = {}) {
  const createLimiter = opts.createLimiter ?? new RateLimiter(5, 60_000);

  const wrap =
    <A extends unknown[]>(fn: (...args: A) => Promise<Response>) =>
    async (...args: A): Promise<Response> => {
      try {
        return await fn(...args);
      } catch (e) {
        return errorResponse(e);
      }
    };

  return {
    /** POST /api/rooms {hostName, settings?} */
    createRoom: wrap(async (req: Request) => {
      if (!createLimiter.take(clientIp(req)))
        throw new HttpError(429, "RATE_LIMITED", "Too many rooms created, try again in a minute");
      const body = await readJson(req);
      const res = await getService().createRoom({
        hostName: str(body.hostName, "hostName", 50),
        settings: settings(body.settings),
      });
      return json({ code: res.view.code, token: res.token, playerId: res.playerId, view: res.view }, 201);
    }),

    /** GET /api/rooms/:code (Authorization optional; without it you are a spectator) */
    getRoom: wrap(async (req: Request, code: string) => {
      const view = await getService().view(roomCode(code), bearer(req));
      return json({ view });
    }),

    /** POST /api/rooms/:code/join {name, autoSit?}. Send your saved token as Bearer to reconnect. */
    joinRoom: wrap(async (req: Request, code: string) => {
      const token = bearer(req);
      const body = await readJson(req);
      const res = await getService().join(roomCode(code), {
        name: str(body.name, "name", 50),
        token,
        autoSit: body.autoSit === true,
      });
      return json({ token: res.token, playerId: res.playerId, view: res.view });
    }),

    /** POST /api/rooms/:code/command {cmd, ...args} */
    command: wrap(async (req: Request, code: string) => {
      const token = requireToken(req);
      const c = roomCode(code);
      const b = await readJson(req);
      const s = getService();
      const id = (k: string) => str(b[k], k, 64);
      let view;
      switch (b.cmd) {
        case "sit":
          view = await s.sit(c, token, int(b.seat, "seat"));
          break;
        case "stand":
          view = await s.stand(c, token);
          break;
        case "setAway":
          view = await s.setAway(c, token, id("targetId"), bool(b.away, "away"));
          break;
        case "startGame":
          view = await s.startGame(c, token);
          break;
        case "setPaused":
          view = await s.setPaused(c, token, bool(b.paused, "paused"));
          break;
        case "kick":
          view = await s.kick(c, token, id("targetId"));
          break;
        case "transferHost":
          view = await s.transferHost(c, token, id("targetId"));
          break;
        case "playAgain":
          view = await s.playAgain(c, token);
          break;
        case "closeRoom":
          view = await s.closeRoom(c, token);
          break;
        case "setAvatar":
          view = await s.setAvatar(c, token, str(b.avatar, "avatar", 16));
          break;
        case "chat":
          view = await s.sendChat(c, token, str(b.text, "text", 400));
          break;
        case "act":
          view = await s.act(c, token, action(b.action), id("actionId"));
          break;
        default:
          throw new HttpError(400, "INVALID", "Unknown command");
      }
      return json({ view });
    }),

    /** GET /api/rooms/:code/history — past hands, filtered for the caller. */
    history: wrap(async (req: Request, code: string) => {
      const items = await getService().history(roomCode(code), requireToken(req));
      return json({ hands: items });
    }),

    /** POST /api/rooms/:code/tick — any client may ask; the server checks its own clock. */
    tick: wrap(async (req: Request, code: string) => {
      const view = await getService().tick(roomCode(code), bearer(req));
      return json({ view });
    }),
  };
}

export type Handlers = ReturnType<typeof createHandlers>;
