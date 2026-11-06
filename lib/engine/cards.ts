/**
 * Cards are two-character strings: rank + suit, e.g. "As", "Td", "2c".
 * Ranks: 2-9, T, J, Q, K, A. Suits: c, d, h, s.
 */
export type Card = string;

export const RANKS = "23456789TJQKA";
export const SUITS = "cdhs";

/** Numeric rank 2..14 (ace high). */
export function rankOf(card: Card): number {
  const idx = RANKS.indexOf(card[0] ?? "");
  if (idx < 0) throw new Error(`Invalid card: ${card}`);
  return idx + 2;
}

export function suitOf(card: Card): string {
  const s = card[1] ?? "";
  if (!SUITS.includes(s) || s === "") throw new Error(`Invalid card: ${card}`);
  return s;
}

export function isValidCard(card: unknown): card is Card {
  return (
    typeof card === "string" &&
    card.length === 2 &&
    RANKS.includes(card[0]!) &&
    SUITS.includes(card[1]!)
  );
}

/** A fresh, ordered 52-card deck. */
export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}
