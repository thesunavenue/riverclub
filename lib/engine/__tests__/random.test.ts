import { describe, expect, it } from "vitest";
import { newDeck } from "../cards";
import { secureRandomInt, shuffle, shuffledDeck } from "../random";

describe("shuffle", () => {
  it("returns a permutation and does not mutate the input", () => {
    const deck = newDeck();
    const copy = deck.slice();
    const out = shuffle(deck);
    expect(deck).toEqual(copy);
    expect(out.slice().sort()).toEqual(copy.slice().sort());
  });

  it("produces 52 unique cards with the secure RNG", () => {
    const d = shuffledDeck();
    expect(new Set(d).size).toBe(52);
  });

  it("rejects an RNG that returns out-of-range values", () => {
    expect(() => shuffle([1, 2, 3], () => 99)).toThrow();
  });

  it("is roughly uniform (all 6 orders of 3 items appear about equally)", () => {
    const counts = new Map<string, number>();
    const N = 30000;
    for (let i = 0; i < N; i++) {
      const k = shuffle(["a", "b", "c"], secureRandomInt).join("");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(N / 6 - 500);
      expect(c).toBeLessThan(N / 6 + 500);
    }
  });
});
