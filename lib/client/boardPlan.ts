/**
 * How new board cards are revealed, shared by the table animation and the sounds.
 * - Flop: the three cards slide out from the first slot.
 * - Turn and river: dealt face down, then flipped after a short, tense pause.
 * When several streets arrive at once (all-in run-out) they are revealed one after another.
 */
export interface CardReveal {
  kind: "spread" | "slow";
  /** Seconds after the board changed. For "slow", when the flip happens. */
  at: number;
  /** Position in the flop (0-2), for the spread. */
  i: number;
}

export const SLOW_FLIP_S = 0.9;

export function boardPlan(prevLen: number, newLen: number): { cards: Map<number, CardReveal>; endsAt: number } {
  const cards = new Map<number, CardReveal>();
  let t = 0;
  if (prevLen < 3 && newLen >= 3) {
    for (let i = 0; i < 3; i++) cards.set(i, { kind: "spread", at: i * 0.07, i });
    t = 0.7;
  }
  for (let idx = Math.max(prevLen, 3); idx < newLen; idx++) {
    cards.set(idx, { kind: "slow", at: t + SLOW_FLIP_S, i: 0 });
    t += SLOW_FLIP_S + 0.3;
  }
  return { cards, endsAt: cards.size ? t : 0 };
}
