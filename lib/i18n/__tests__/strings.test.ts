import { describe, expect, it } from "vitest";
import { STRINGS, format, formatChips } from "../strings";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("UI strings", () => {
  it("every language has every key, non-empty, with the same placeholders", () => {
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
      expect(STRINGS.vi[key], key).toBeTruthy();
      expect(placeholders(STRINGS.vi[key]), key).toEqual(placeholders(STRINGS.en[key]));
    }
  });

  it("formats placeholders and chip amounts per language", () => {
    expect(format(STRINGS.en.call, { n: 20 })).toBe("Call 20");
    expect(formatChips(1000, "en")).toBe("1,000");
    expect(formatChips(1000, "vi")).toBe("1.000");
  });
});
