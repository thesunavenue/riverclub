import { rankOf, suitOf, type Card } from "./cards";

export type HandCategory =
  | "high_card"
  | "pair"
  | "two_pair"
  | "three_of_a_kind"
  | "straight"
  | "flush"
  | "full_house"
  | "four_of_a_kind"
  | "straight_flush";

const CATEGORIES: HandCategory[] = [
  "high_card",
  "pair",
  "two_pair",
  "three_of_a_kind",
  "straight",
  "flush",
  "full_house",
  "four_of_a_kind",
  "straight_flush",
];

export interface HandValue {
  /** Higher is better. Equal scores tie. */
  score: number;
  category: HandCategory;
  /** The best five cards. */
  cards: Card[];
}

function encode(category: number, tiebreak: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 16 + (tiebreak[i] ?? 0);
  return score;
}

/** Evaluate exactly five cards. */
export function evaluate5(cards: Card[]): HandValue {
  if (cards.length !== 5) throw new Error("evaluate5 needs 5 cards");
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const isFlush = new Set(cards.map(suitOf)).size === 1;

  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5; // A-2-3-4-5 wheel
  }

  // Group by rank: sort by count desc, then rank desc.
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const groupRanks = groups.map((g) => g[0]);
  const shape = groups.map((g) => g[1]).join("");

  let cat: number;
  let tiebreak: number[];
  if (straightHigh && isFlush) {
    cat = 8;
    tiebreak = [straightHigh];
  } else if (shape === "41") {
    cat = 7;
    tiebreak = groupRanks;
  } else if (shape === "32") {
    cat = 6;
    tiebreak = groupRanks;
  } else if (isFlush) {
    cat = 5;
    tiebreak = ranks;
  } else if (straightHigh) {
    cat = 4;
    tiebreak = [straightHigh];
  } else if (shape === "311") {
    cat = 3;
    tiebreak = groupRanks;
  } else if (shape === "221") {
    cat = 2;
    tiebreak = groupRanks;
  } else if (shape === "2111") {
    cat = 1;
    tiebreak = groupRanks;
  } else {
    cat = 0;
    tiebreak = ranks;
  }
  return { score: encode(cat, tiebreak), category: CATEGORIES[cat]!, cards: cards.slice() };
}

/** Best 5-card hand from 5 to 7 cards. */
export function evaluateBest(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error("evaluateBest needs 5-7 cards");
  let best: HandValue | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const v = evaluate5([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]);
            if (!best || v.score > best.score) best = v;
          }
  return best!;
}
