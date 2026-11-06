// Server only: the handlers wired to the real room service (Supabase or in-memory).
import { getRoomService } from "../room/store-factory";
import { createHandlers } from "./handlers";

export const handlers = createHandlers(getRoomService);
