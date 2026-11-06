import { randomInt } from "node:crypto";
import { newDeck, type Card } from "./cards";

/** Returns a uniform integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

/** Cryptographically secure RNG (server only). Node's randomInt is unbiased. */
export const secureRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

/** Fisher-Yates shuffle. Returns a new array; does not mutate input. */
export function shuffle<T>(items: readonly T[], rng: RandomInt = secureRandomInt): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error("RNG out of range");
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/** A freshly shuffled 52-card deck using the secure RNG. */
export function shuffledDeck(rng: RandomInt = secureRandomInt): Card[] {
  return shuffle(newDeck(), rng);
}
