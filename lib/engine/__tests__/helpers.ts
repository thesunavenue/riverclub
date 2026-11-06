import { newDeck, type Card } from "../cards";
import { applyAction, startHand } from "../game";
import type { Action, HandState } from "../types";

/**
 * Build a deck so that player i (in seat order) gets holes[i], then the board
 * comes out in order (flop, turn, river). Remaining cards fill the rest.
 */
export function rigDeck(holes: Card[][], board: Card[] = []): Card[] {
  const used = [...holes.flat(), ...board];
  if (new Set(used).size !== used.length) throw new Error("rigDeck: duplicate card");
  return [...used, ...newDeck().filter((c) => !used.includes(c))];
}

export interface Opts {
  button?: number;
  sb?: number;
  bb?: number;
  seats?: number[];
  holes?: Card[][];
  board?: Card[];
}

/** Players are p0, p1, ... at seats 0, 1, ... (or opts.seats). */
export function start(stacks: number[], opts: Opts = {}): HandState {
  const seats = opts.seats ?? stacks.map((_, i) => i);
  return startHand({
    handNumber: 1,
    players: stacks.map((stack, i) => ({ id: `p${i}`, seat: seats[i]!, stack })),
    buttonSeat: opts.button ?? seats[0]!,
    smallBlind: opts.sb ?? 10,
    bigBlind: opts.bb ?? 20,
    deck: opts.holes ? rigDeck(opts.holes, opts.board) : newDeck(),
  });
}

export const toActId = (s: HandState) => (s.toAct === null ? null : s.players[s.toAct]!.id);

/** Apply a sequence like ["p0 call", "p1 raise 60", "p2 fold"]. */
export function play(s: HandState, steps: string[]): HandState {
  for (const step of steps) {
    const [id, type, amt] = step.split(" ");
    const action = (type === "raise" ? { type, to: Number(amt) } : { type }) as Action;
    s = applyAction(s, id!, action);
  }
  return s;
}

export const stacks = (s: HandState) => s.players.map((p) => p.stack);

/** Deterministic PRNG for reproducible fuzz tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
