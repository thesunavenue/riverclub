import type { Card } from "./cards";
import { legalActions } from "./game";
import type { HandResult, HandState, LegalActions, LogEntry, Street } from "./types";

export interface PlayerView {
  id: string;
  seat: number;
  stack: number;
  bet: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Only the viewer's own cards, or cards revealed at showdown. Otherwise null. */
  hole: Card[] | null;
}

/** Everything one client may see. Never contains the deck or others' hidden cards. */
export interface HandView {
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  street: Street;
  board: Card[];
  buttonSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  /** Total chips in the middle, including current street bets. */
  pot: number;
  currentBet: number;
  toActId: string | null;
  players: PlayerView[];
  /** Present only when it is the viewer's turn. */
  legal: LegalActions | null;
  log: LogEntry[];
  result: HandResult | null;
}

/**
 * Build the view for one viewer (`null` = spectator).
 * Built field by field (allow-list) so new secret fields are never leaked by accident.
 */
export function viewFor(s: HandState, viewerId: string | null): HandView {
  const revealed = new Set(s.result?.showdown ? Object.keys(s.result.hands) : []);
  const toActId = s.toAct === null ? null : s.players[s.toAct]!.id;
  return {
    handNumber: s.handNumber,
    smallBlind: s.smallBlind,
    bigBlind: s.bigBlind,
    street: s.street,
    board: s.board.slice(),
    buttonSeat: s.buttonSeat,
    smallBlindSeat: s.smallBlindSeat,
    bigBlindSeat: s.bigBlindSeat,
    pot: s.street === "complete" ? 0 : s.players.reduce((a, p) => a + p.committed, 0),
    currentBet: s.currentBet,
    toActId,
    players: s.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      stack: p.stack,
      bet: p.bet,
      committed: p.committed,
      folded: p.folded,
      allIn: p.allIn,
      hole: p.id === viewerId || revealed.has(p.id) ? p.hole.slice() : null,
    })),
    legal: viewerId !== null && toActId === viewerId ? legalActions(s) : null,
    log: s.log.map((e) => ({ ...e })),
    result: s.result ? structuredClone(s.result) : null,
  };
}
