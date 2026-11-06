import type { Card, HandState } from "../engine";

export interface RoomSettings {
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  turnSeconds: number;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  startingStack: 1000,
  smallBlind: 10,
  bigBlind: 20,
  turnSeconds: 30,
};

/** Pause between hands so people can see the showdown. */
export const HAND_PAUSE_MS = 5000;
export const MAX_ROOM_PLAYERS = 30;
export const MAX_NAME_LENGTH = 20;
export const RECENT_ACTION_IDS = 100;
export const MAX_CHAT_MESSAGES = 50;
export const MAX_CHAT_LENGTH = 200;
/** Minimum time between two chat messages from the same player. */
export const CHAT_INTERVAL_MS = 1000;
/** Missed turns in a row (timer ran out) before a player is set to "sitting out". */
export const MAX_MISSED_TURNS = 2;
/** How many finished hands each room keeps for the hand history. */
export const HISTORY_HANDS = 20;
/** Avatars a player can have. Emoji: drawn by the device, nothing to download. */
export const AVATARS = [
  "🦊", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🐧", "🐙", "🦉", "🐻", "🐰",
  "🐱", "🐶", "🦄", "🐲", "🐢", "🦀", "🐳", "🦋", "🐝", "🦔", "🦦", "🦩",
] as const;

export interface ChatMessage {
  id: string;
  playerId: string;
  /** Name at the time of sending. */
  name: string;
  text: string;
  at: number;
}

export interface HistoryEntry {
  hand: HandState;
  /** Player names at the time, so the history still reads well after people leave. */
  names: Record<string, string>;
  endedAt: number;
}

export interface Elimination {
  playerId: string;
  name: string;
  handNumber: number;
}

export interface RoomPlayer {
  /** Public id, shown to everyone. */
  id: string;
  name: string;
  /** Secret: sha256 of the guest token kept on the player's device. Never sent to clients. */
  tokenHash: string;
  seat: number | null;
  /** Chips between hands. During a hand the engine's HandState holds the live stack. */
  stack: number;
  /** Sitting out: auto check/fold on turn, not dealt into new hands. */
  away: boolean;
  /** Stood up during a hand: auto-fold, seat is freed when the hand ends. */
  leaving: boolean;
  /** Removed by the host: cannot rejoin with the same token. */
  banned: boolean;
  /** When this player last sent a chat message (rate limit). */
  lastChatAt?: number;
  /** Turns in a row the timer ran out for this player. */
  missedTurns?: number;
  /** One of AVATARS. */
  avatar?: string;
}

export interface RoomState {
  code: string;
  /** Increases on every saved change. Used for compare-and-swap writes. */
  version: number;
  createdAt: number;
  lastActivityAt: number;
  settings: RoomSettings;
  hostId: string;
  /**
   * waiting: before the host starts. playing: hands are dealt.
   * finished: only one player has chips left (busted players are out). closed: host closed the table.
   */
  status: "waiting" | "playing" | "finished" | "closed";
  /** Host paused: the current hand finishes but no new hand starts. */
  paused: boolean;
  players: RoomPlayer[];
  /** Current hand, or the last finished one (kept so clients can see the result). */
  hand: HandState | null;
  handCount: number;
  buttonSeat: number | null;
  /** When the current player's turn runs out (ms epoch). */
  turnDeadline: number | null;
  /** Identifies the turn the deadline belongs to. */
  turnKey: string | null;
  /** When the next hand may start (ms epoch). Null while a hand is running. */
  nextHandAt: number | null;
  /** Recently processed client action ids, so a resent action is not applied twice. */
  recentActionIds: string[];
  /** Number of the last finished hand whose chips were already paid back to the room. */
  settledHand?: number;
  /** Players who ran out of chips this game, in order. */
  eliminated?: Elimination[];
  /** Last player with chips when the game finished. */
  winnerId?: string | null;
  /** Last finished hands (deck removed), oldest first. Server-side only; clients get filtered views. */
  history?: HistoryEntry[];
  /** Last chat messages, oldest first. */
  chat?: ChatMessage[];
  /** Chips ever given out in this room (starting stacks; reset on "play again"). For the invariant check. */
  chipsIssued: number;
}

/** Everything non-deterministic is injected, so room logic stays pure and testable. */
export interface RoomCtx {
  now: number;
  newDeck: () => Card[];
  newId: () => string;
  /** Uniform integer in [0, n). Optional: tests may leave it out. */
  random?: (n: number) => number;
}

export type RoomErrorCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BANNED"
  | "INVALID"
  | "SEAT_TAKEN"
  | "ROOM_FULL"
  | "NAME_TAKEN"
  | "NOT_ENOUGH_PLAYERS"
  | "NO_HAND"
  | "RATE_LIMITED"
  | "CLOSED"
  | "CONFLICT";

export class RoomError extends Error {
  constructor(
    public code: RoomErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RoomError";
  }
}
