import { isValidCard } from "./cards";
import { MAX_SEATS, settlePots } from "./pots";
import {
  EngineError,
  type Action,
  type HandState,
  type LegalActions,
  type LogEntry,
  type PlayerState,
  type StartHandInput,
} from "./types";

const isPosInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

function validate(input: StartHandInput): void {
  const fail = (msg: string) => {
    throw new EngineError("INVALID_SETUP", msg);
  };
  const { players, smallBlind, bigBlind, deck, buttonSeat } = input;
  if (!Number.isInteger(input.handNumber)) fail("handNumber must be an integer");
  if (players.length < 2 || players.length > MAX_SEATS) fail("Need 2 to 9 players");
  const seats = new Set<number>();
  const ids = new Set<string>();
  for (const p of players) {
    if (!p.id) fail("Player id required");
    if (!Number.isInteger(p.seat) || p.seat < 0 || p.seat >= MAX_SEATS) fail("Bad seat");
    if (!isPosInt(p.stack)) fail("Each player needs a positive integer stack");
    seats.add(p.seat);
    ids.add(p.id);
  }
  if (seats.size !== players.length) fail("Duplicate seat");
  if (ids.size !== players.length) fail("Duplicate player id");
  if (!seats.has(buttonSeat)) fail("Button must be on a seated player");
  if (!isPosInt(smallBlind) || !isPosInt(bigBlind) || smallBlind > bigBlind) fail("Bad blinds");
  if (deck.length !== 52 || new Set(deck).size !== 52 || !deck.every(isValidCard))
    fail("Deck must be 52 unique cards");
}


/** Move chips from stack into the pot for this street. */
function put(p: PlayerState, chips: number): void {
  const amt = Math.min(chips, p.stack);
  p.stack -= amt;
  p.bet += amt;
  p.committed += amt;
  if (p.stack === 0) p.allIn = true;
}

function log(s: HandState, entry: Omit<LogEntry, "street">): void {
  s.log.push({ ...entry, street: s.street });
}

/** Start a new hand: deal hole cards and post blinds. */
export function startHand(input: StartHandInput): HandState {
  validate(input);
  const sorted = [...input.players].sort((a, b) => a.seat - b.seat);
  const deck = input.deck.slice();
  const players: PlayerState[] = sorted.map((p) => ({
    id: p.id,
    seat: p.seat,
    stack: p.stack,
    bet: 0,
    committed: 0,
    folded: false,
    allIn: false,
    hasActed: false,
    actedAtBet: 0,
    hole: deck.splice(0, 2),
  }));

  const btn = players.findIndex((p) => p.seat === input.buttonSeat);
  const n = players.length;
  // Heads-up: the button posts the small blind and acts first preflop.
  const sb = n === 2 ? btn : (btn + 1) % n;
  const bb = (sb + 1) % n;

  const s: HandState = {
    handNumber: input.handNumber,
    smallBlind: input.smallBlind,
    bigBlind: input.bigBlind,
    players,
    buttonSeat: input.buttonSeat,
    smallBlindSeat: players[sb]!.seat,
    bigBlindSeat: players[bb]!.seat,
    street: "preflop",
    board: [],
    deck,
    // Others must match the full big blind even if the big blind is short.
    currentBet: input.bigBlind,
    minRaise: input.bigBlind,
    toAct: null,
    log: [],
    result: null,
  };

  put(players[sb]!, input.smallBlind);
  log(s, { playerId: players[sb]!.id, type: "small_blind", amount: players[sb]!.bet, allIn: players[sb]!.allIn });
  put(players[bb]!, input.bigBlind);
  log(s, { playerId: players[bb]!.id, type: "big_blind", amount: players[bb]!.bet, allIn: players[bb]!.allIn });

  progress(s, bb);
  return s;
}

function computeLegal(s: HandState, idx: number): LegalActions {
  const p = s.players[idx]!;
  const toCall = Math.max(0, s.currentBet - p.bet);
  const maxRaiseTo = p.bet + p.stack;
  const othersCanAct = s.players.some((q) => q !== p && !q.folded && !q.allIn);
  // Betting is reopened for this player only by a full raise (or several all-ins adding up to one).
  const reopened = !p.hasActed || s.currentBet - p.actedAtBet >= s.minRaise;
  return {
    playerId: p.id,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount: Math.min(toCall, p.stack),
    canRaise: othersCanAct && reopened && maxRaiseTo > s.currentBet,
    minRaiseTo: Math.min(s.currentBet + s.minRaise, maxRaiseTo),
    maxRaiseTo,
  };
}

/** Legal actions for the player whose turn it is, or null if the hand is over. */
export function legalActions(s: HandState): LegalActions | null {
  if (s.street === "complete" || s.toAct === null) return null;
  return computeLegal(s, s.toAct);
}

/** Apply one action. Pure: returns a new state. Throws EngineError if not allowed. */
export function applyAction(state: HandState, playerId: string, action: Action): HandState {
  if (state.street === "complete" || state.toAct === null)
    throw new EngineError("HAND_OVER", "Hand is over");
  if (state.players[state.toAct]!.id !== playerId)
    throw new EngineError("NOT_YOUR_TURN", "Not your turn");

  const s = structuredClone(state);
  const idx = s.toAct!;
  const p = s.players[idx]!;
  const legal = computeLegal(s, idx);

  switch (action?.type) {
    case "fold":
      p.folded = true;
      log(s, { playerId, type: "fold" });
      break;
    case "check":
      if (!legal.canCheck) throw new EngineError("ILLEGAL_ACTION", "Cannot check, must call or fold");
      log(s, { playerId, type: "check" });
      break;
    case "call":
      if (!legal.canCall) throw new EngineError("ILLEGAL_ACTION", "Nothing to call");
      put(p, legal.callAmount);
      log(s, { playerId, type: "call", amount: p.bet, allIn: p.allIn });
      break;
    case "raise": {
      if (!legal.canRaise) throw new EngineError("ILLEGAL_ACTION", "Raising is not allowed now");
      const to = action.to;
      if (!Number.isInteger(to) || to < legal.minRaiseTo || to > legal.maxRaiseTo)
        throw new EngineError(
          "INVALID_AMOUNT",
          `Raise must be to between ${legal.minRaiseTo} and ${legal.maxRaiseTo}`,
        );
      const isOpeningBet = s.currentBet === 0;
      const raiseSize = to - s.currentBet;
      put(p, to - p.bet);
      if (raiseSize >= s.minRaise) s.minRaise = raiseSize; // full raise
      s.currentBet = to;
      log(s, { playerId, type: isOpeningBet ? "bet" : "raise", amount: to, allIn: p.allIn });
      break;
    }
    default:
      throw new EngineError("ILLEGAL_ACTION", "Unknown action");
  }

  p.hasActed = true;
  p.actedAtBet = s.currentBet;
  progress(s, idx);
  return s;
}

/** What the server does when a player's turn timer runs out. */
export function timeoutAction(s: HandState): Action | null {
  const legal = legalActions(s);
  if (!legal) return null;
  return legal.canCheck ? { type: "check" } : { type: "fold" };
}

/**
 * After an action (or after blinds), find who acts next,
 * or move to the next street, or finish the hand.
 */
function progress(s: HandState, fromIdx: number): void {
  for (;;) {
    const live = s.players.filter((p) => !p.folded);
    if (live.length === 1) return finish(s);

    const active = live.filter((p) => !p.allIn);
    const only = active[0];
    if (
      active.length === 0 ||
      (active.length === 1 &&
        only!.bet >= Math.max(...live.filter((p) => p !== only).map((p) => p.bet)))
    ) {
      // Nobody left to bet against: deal the rest of the board.
      while (s.board.length < 5) s.board.push(s.deck.shift()!);
      return finish(s);
    }

    for (let k = 1; k <= s.players.length; k++) {
      const i = (fromIdx + k) % s.players.length;
      const p = s.players[i]!;
      if (!p.folded && !p.allIn && (!p.hasActed || p.bet < s.currentBet)) {
        s.toAct = i;
        return;
      }
    }

    // Betting round is complete.
    if (s.street === "river") return finish(s);
    const dealCount = s.street === "preflop" ? 3 : 1;
    s.street = s.street === "preflop" ? "flop" : s.street === "flop" ? "turn" : "river";
    for (let k = 0; k < dealCount; k++) s.board.push(s.deck.shift()!);
    for (const p of s.players) {
      p.bet = 0;
      p.hasActed = false;
      p.actedAtBet = 0;
    }
    s.currentBet = 0;
    s.minRaise = s.bigBlind;
    // Post-flop, the first live player left of the button acts first.
    fromIdx = s.players.findIndex((p) => p.seat === s.buttonSeat);
  }
}

function finish(s: HandState): void {
  const result = settlePots(s.players, s.board, s.buttonSeat);
  for (const p of s.players) {
    p.stack += result.payouts[p.id] ?? 0;
    p.bet = 0;
  }
  s.street = "complete";
  s.toAct = null;
  s.result = result;
}

/** Simple moving button: next occupied seat clockwise after the previous button. */
export function nextButtonSeat(seats: number[], prevButtonSeat: number | null): number {
  if (seats.length === 0) throw new EngineError("INVALID_SETUP", "No seats");
  const sorted = [...seats].sort((a, b) => a - b);
  if (prevButtonSeat === null) return sorted[0]!;
  return sorted.find((x) => x > prevButtonSeat) ?? sorted[0]!;
}

/** Total chips on the table (stacks + chips in the pot). Must never change during a hand. */
export function totalChips(s: HandState): number {
  return s.players.reduce(
    (sum, p) => sum + p.stack + (s.street === "complete" ? 0 : p.committed),
    0,
  );
}
