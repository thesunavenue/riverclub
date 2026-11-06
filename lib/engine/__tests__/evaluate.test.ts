import { describe, expect, it } from "vitest";
import { evaluate5, evaluateBest } from "../evaluate";

const h = (s: string) => evaluate5(s.split(" "));
const best = (s: string) => evaluateBest(s.split(" "));

describe("hand evaluator", () => {
  it("ranks categories in the right order", () => {
    const ordered = [
      "2c 5d 9h Js Kd", // high card
      "2c 2d 9h Js Kd", // pair
      "2c 2d 9h 9s Kd", // two pair
      "2c 2d 2h 9s Kd", // trips
      "5c 6d 7h 8s 9d", // straight
      "2h 5h 9h Jh Kh", // flush
      "2c 2d 2h 9s 9d", // full house
      "2c 2d 2h 2s 9d", // quads
      "5h 6h 7h 8h 9h", // straight flush
    ].map(h);
    expect(ordered.map((v) => v.category)).toEqual([
      "high_card",
      "pair",
      "two_pair",
      "three_of_a_kind",
      "straight",
      "flush",
      "full_house",
      "four_of_a_kind",
      "straight_flush",
    ]);
    for (let i = 1; i < ordered.length; i++)
      expect(ordered[i]!.score).toBeGreaterThan(ordered[i - 1]!.score);
  });

  it("treats A-2-3-4-5 as the lowest straight", () => {
    const wheel = h("Ac 2d 3h 4s 5d");
    expect(wheel.category).toBe("straight");
    expect(h("2c 3d 4h 5s 6d").score).toBeGreaterThan(wheel.score);
    expect(h("Tc Jd Qh Ks Ad").score).toBeGreaterThan(h("9c Td Jh Qs Kd").score);
    expect(h("Ah 2h 3h 4h 5h").category).toBe("straight_flush");
    expect(h("Qc Kd Ah 2s 3d").category).toBe("high_card"); // no wrap-around
  });

  it("uses kickers correctly", () => {
    expect(h("Ac Ad 9h 7s 3d").score).toBeGreaterThan(h("Ah As 9c 7d 2d").score);
    expect(h("Kc Kd 9h 9s 3d").score).toBeGreaterThan(h("Kh Ks 8c 8d Ad").score);
    expect(h("Kc Kd 9h 9s 4d").score).toBeGreaterThan(h("Kh Ks 9c 9d 3d").score);
    expect(h("3c 3d 3h 2s 2d").score).toBeGreaterThan(h("2h 2s 2c As Ad").score);
    expect(h("Ah Jh 9h 7h 3h").score).toBeGreaterThan(h("Ad Jd 9d 7d 2d").score);
    expect(h("Ac Ad 9h 7s 3d").score).toBe(h("Ah As 9c 7d 3c").score); // exact tie
  });

  it("finds the best five of seven", () => {
    const v = best("Ah 2h 7h 9h Kc Kd Jh");
    expect(v.category).toBe("flush");
    expect(v.cards.sort()).toEqual(["2h", "7h", "9h", "Ah", "Jh"].sort());
    expect(best("4c 5d 6h 7s 8d 8c 8h").category).toBe("straight");
    expect(best("9c 9d 9h 4s 4d 4c 2h").category).toBe("full_house");
  });

  it("ties when the board plays for both", () => {
    const board = "Tc Jd Qh Ks Ad";
    expect(best(`2c 3d ${board}`).score).toBe(best(`4h 5s ${board}`).score);
  });
});
