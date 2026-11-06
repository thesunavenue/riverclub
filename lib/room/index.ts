// Safe for the browser: types and the view shape only.
// Server code imports "./service", "./secrets" and "./room" directly.
export * from "./types";
export type { RoomView, RoomPlayerView, HistoryItem } from "./view";
