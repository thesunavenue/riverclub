import type { Card } from "./cards";
import type { HandCategory } from "./evaluate";

export type Street = "preflop" | "flop" | "turn" | "river" | "complete";

export type Action =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  /** Bet or raise. `to` is the player's total bet on this street after the action. */
  | { type: "raise"; to: number };

export interface PlayerState {
  id: string;
  /** Table seat number, 0..8. */
  seat: number;
  /** Chips behind (not yet put in). */
  stack: number;
  /** Chips put in on the current street. */
  bet: number;
  /** Chips put in during the whole hand. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Has voluntarily acted on this street (blinds do not count). */
  hasActed: boolean;
  /** The table's current bet right after this player last acted on this street. */
  actedAtBet: number;
  /** Secret: never send other players' hole cards to a client. Use viewFor(). */
  hole: Card[];
}

export interface LogEntry {
  playerId: string;
  street: Street;
  /** "bet" = first bet on a street; "raise" = raising an existing bet (same action input). */
  type: "small_blind" | "big_blind" | "bet" | Action["type"];
  /** Player's total street bet after the action (for blinds, calls, raises). */
  amount?: number;
  allIn?: boolean;
}

export interface PotResult {
  amount: number;
  eligible: string[];
  winners: string[];
}

export interface ShowdownHand {
  category: HandCategory;
  cards: Card[];
}

export interface HandResult {
  /** True if two or more players reached showdown (cards are revealed). */
  showdown: boolean;
  pots: PotResult[];
  /** Chips won by each player this hand (gross, including their own returned chips). */
  payouts: Record<string, number>;
  /** Best hand per player at showdown. Empty if no showdown. */
  hands: Record<string, ShowdownHand>;
}

export interface HandState {
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  /** Players dealt into this hand, ordered by seat. */
  players: PlayerState[];
  buttonSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  street: Street;
  board: Card[];
  /** Secret: remaining deck. Never send to clients. */
  deck: Card[];
  /** Highest street bet that must be matched. */
  currentBet: number;
  /** Size of the last full bet/raise on this street (minimum raise increment). */
  minRaise: number;
  /** Index into `players` of who must act, or null if nobody (hand over). */
  toAct: number | null;
  log: LogEntry[];
  result: HandResult | null;
}

export interface StartHandInput {
  handNumber: number;
  players: { id: string; seat: number; stack: number }[];
  buttonSeat: number;
  smallBlind: number;
  bigBlind: number;
  /** A full 52-card shuffled deck. The engine deals from the front. */
  deck: Card[];
}

export interface LegalActions {
  playerId: string;
  canCheck: boolean;
  canCall: boolean;
  /** Chips the player adds by calling (capped by stack). */
  callAmount: number;
  canRaise: boolean;
  /** Minimum legal `to` for a raise (or all-in if smaller). */
  minRaiseTo: number;
  /** Maximum legal `to` (all-in). */
  maxRaiseTo: number;
}

export class EngineError extends Error {
  constructor(
    public code:
      | "INVALID_SETUP"
      | "HAND_OVER"
      | "NOT_YOUR_TURN"
      | "ILLEGAL_ACTION"
      | "INVALID_AMOUNT",
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}
