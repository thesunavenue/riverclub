// Server only. Picks the room store from the environment and keeps one RoomService per process.
import { createClient } from "@supabase/supabase-js";
import { RoomService } from "./service";
import { MemoryRoomStore, type RoomStore } from "./store";
import { SupabaseRoomStore } from "./store-supabase";

interface SupabaseEnv {
  url: string;
  secretKey: string;
}

function supabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  return url && secretKey ? { url, secretKey } : null;
}

/**
 * Tell clients "room X is now at version N" over Supabase Realtime broadcast.
 * Only {code, version} is sent; clients then fetch their own private view from the API.
 * Uses the Realtime REST broadcast endpoint so no socket is held open on serverless.
 */
function makeBroadcaster(env: SupabaseEnv | null) {
  if (!env) return undefined;
  return async (code: string, version: number) => {
    try {
      const res = await fetch(`${env.url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: env.secretKey },
        body: JSON.stringify({
          messages: [{ topic: `room:${code}`, event: "version", payload: { code, version } }],
        }),
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) console.warn(`[riverclub] realtime broadcast failed: HTTP ${res.status}`);
    } catch {
      // Clients also poll, so a missed broadcast only delays an update.
      console.warn("[riverclub] realtime broadcast failed");
    }
  };
}

// Only the in-memory *data* lives on globalThis (so dev hot reload keeps rooms).
// The service is per module instance, so code changes apply after a reload.
type Cache = { memoryStore?: MemoryRoomStore };
const g = globalThis as typeof globalThis & { __riverclub?: Cache };
let service: RoomService | undefined;

export function getRoomService(): RoomService {
  const cache = (g.__riverclub ??= {});
  if (service) return service;

  const env = supabaseEnv();
  let store: RoomStore;
  if (env) {
    store = new SupabaseRoomStore(
      createClient(env.url, env.secretKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    );
  } else {
    console.warn(
      "[riverclub] Supabase env not set: using in-memory room store (local dev only, rooms vanish on restart).",
    );
    // Survives Next dev hot reloads because it lives on globalThis.
    store = cache.memoryStore ??= new MemoryRoomStore();
  }
  service = new RoomService({ store, onChange: makeBroadcaster(env) });
  return service;
}
