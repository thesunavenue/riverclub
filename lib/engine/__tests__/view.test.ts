import { describe, expect, it } from "vitest";
import { newDeck } from "../cards";
import type { HandState } from "../types";
import { viewFor } from "../view";
import { play, start } from "./helpers";

/** Every card the viewer must NOT see must be absent from the serialized payload. */
function expectNoLeak(s: HandState, viewerId: string | null) {
  const view = viewFor(s, viewerId);
  const json = JSON.stringify(view);
  const visible = new Set<string>(s.board);
  for (const p of s.players) {
    const shown = p.id === viewerId || (s.result?.showdown && s.result.hands[p.id]);
    if (shown) p.hole.forEach((c) => visible.add(c));
  }
  for (const card of newDeck()) {
    if (!visible.has(card)) expect(json, `leaked ${card} to ${viewerId}`).not.toContain(`"${card}"`);
  }
  expect(json).not.toContain("deck");
  return view;
}

describe("viewFor (what a client receives)", () => {
  it("shows only the viewer's own hole cards mid-hand", () => {
    const s = play(start([1000, 1000, 1000]), ["p0 call", "p1 call", "p2 check"]);
    for (const viewer of ["p0", "p1", "p2", null]) {
      const v = expectNoLeak(s, viewer);
      for (const p of v.players) {
        if (p.id === viewer) expect(p.hole).toEqual(s.players.find((x) => x.id === viewer)!.hole);
        else expect(p.hole).toBeNull();
      }
    }
  });

  it("only gives legal actions to the player whose turn it is", () => {
    const s = start([1000, 1000, 1000]);
    expect(viewFor(s, "p0").legal).not.toBeNull();
    expect(viewFor(s, "p1").legal).toBeNull();
    expect(viewFor(s, null).legal).toBeNull();
  });

  it("does not reveal cards when everyone folds", () => {
    const s = play(start([1000, 1000, 1000]), ["p0 fold", "p1 fold"]);
    expectNoLeak(s, "p0");
    expectNoLeak(s, null);
    expect(viewFor(s, "p0").players.find((p) => p.id === "p2")!.hole).toBeNull();
  });

  it("reveals only showdown players' cards, never folded players' cards", () => {
    let s = start([1000, 1000, 1000]);
    s = play(s, ["p0 call", "p1 fold", "p2 check"]);
    for (let i = 0; i < 3; i++) s = play(s, ["p2 check", "p0 check"]);
    expect(s.result!.showdown).toBe(true);
    const v = expectNoLeak(s, "p1");
    expect(v.players.find((p) => p.id === "p0")!.hole).not.toBeNull();
    expect(v.players.find((p) => p.id === "p2")!.hole).not.toBeNull();
    // p1's own cards are visible to p1 only.
    expect(viewFor(s, "p0").players.find((p) => p.id === "p1")!.hole).toBeNull();
    expectNoLeak(s, "p0");
  });

  it("does not leak the run-out cards or deck after an all-in", () => {
    const s = play(start([100, 1000, 1000]), ["p0 raise 100", "p1 fold", "p2 call"]);
    expect(s.street).toBe("complete");
    expectNoLeak(s, "p1");
    expectNoLeak(s, null);
  });
});
