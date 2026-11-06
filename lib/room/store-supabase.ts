// Server only: uses the Supabase SECRET key, which bypasses RLS. Never import from client code.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoomStore } from "./store";
import type { RoomState } from "./types";

const TABLE = "rooms";

/** Postgres-backed store. `update` is a compare-and-swap on the `version` column. */
export class SupabaseRoomStore implements RoomStore {
  constructor(private db: SupabaseClient) {}

  async get(code: string): Promise<RoomState | null> {
    const { data, error } = await this.db.from(TABLE).select("state").eq("code", code).maybeSingle();
    if (error) throw new Error(`rooms.get failed: ${error.code ?? "unknown"}`);
    return data ? (data.state as RoomState) : null;
  }

  async insert(room: RoomState): Promise<boolean> {
    const { error } = await this.db.from(TABLE).insert(row(room));
    if (!error) return true;
    if (error.code === "23505") return false; // unique violation: code already used
    throw new Error(`rooms.insert failed: ${error.code ?? "unknown"}`);
  }

  async deleteInactive(beforeMs: number): Promise<number> {
    const { data, error } = await this.db
      .from(TABLE)
      .delete()
      .lt("last_activity_at", new Date(beforeMs).toISOString())
      .select("code");
    if (error) throw new Error(`rooms.deleteInactive failed: ${error.code ?? "unknown"}`);
    return data?.length ?? 0;
  }

  async update(room: RoomState, expectedVersion: number): Promise<boolean> {
    const { data, error } = await this.db
      .from(TABLE)
      .update(row(room))
      .eq("code", room.code)
      .eq("version", expectedVersion)
      .select("code");
    if (error) throw new Error(`rooms.update failed: ${error.code ?? "unknown"}`);
    return (data?.length ?? 0) === 1;
  }
}

function row(room: RoomState) {
  return {
    code: room.code,
    state: room,
    version: room.version,
    last_activity_at: new Date(room.lastActivityAt).toISOString(),
  };
}
