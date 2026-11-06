import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "..");

describe("engine entry point", () => {
  it("only random.ts uses Node-only modules, and index.ts does not export it", () => {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(join(dir, f), "utf8");
      if (f === "random.ts") continue;
      expect(src, f).not.toMatch(/from\s+["']node:/);
      expect(src, f).not.toMatch(/from\s+["']\.\/random["']/);
    }
  });
});
