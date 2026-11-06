import type { RoomState } from "./types";

/**
 * Where rooms are saved. The Supabase version comes in step 2b;
 * MemoryRoomStore is for tests and local development.
 */
export interface RoomStore {
  get(code: string): Promise<RoomState | null>;
  /** Insert a new room. Returns false if the code is already used. */
  insert(room: RoomState): Promise<boolean>;
  /** Compare-and-swap: save only if the stored version is still `expectedVersion`. */
  update(room: RoomState, expectedVersion: number): Promise<boolean>;
  /** Delete rooms with no player activity since `beforeMs`. Returns how many were deleted. */
  deleteInactive(beforeMs: number): Promise<number>;
}

export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, RoomState>();

  async get(code: string): Promise<RoomState | null> {
    await Promise.resolve(); // behave like real async I/O so concurrent calls interleave
    const r = this.rooms.get(code);
    return r ? structuredClone(r) : null;
  }

  async insert(room: RoomState): Promise<boolean> {
    await Promise.resolve();
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }

  async deleteInactive(beforeMs: number): Promise<number> {
    let n = 0;
    for (const [code, r] of this.rooms) if (r.lastActivityAt < beforeMs && this.rooms.delete(code)) n++;
    return n;
  }

  async update(room: RoomState, expectedVersion: number): Promise<boolean> {
    await Promise.resolve();
    const cur = this.rooms.get(room.code);
    if (!cur || cur.version !== expectedVersion) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }
}
