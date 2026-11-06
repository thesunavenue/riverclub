import { describe, expect, it } from "vitest";
import { newDeck } from "../cards";
import { applyAction, legalActions, startHand, totalChips } from "../game";
import { shuffle } from "../random";
import type { Action, HandState } from "../types";
import { viewFor } from "../view";
import { mulberry32 } from "./helpers";

/**
 * Plays thousands of random hands with random legal actions and checks invariants
 * after every step. Seeded, so any failure is reproducible.
 */
describe("random play invariants", () => {
  it("total chips never change, hands always finish, no card leaks", () => {
    const rand = mulberry32(20261105);
    const int = (n: number) => Math.floor(rand() * n);
    const HANDS = 3000;

    for (let h = 0; h < HANDS; h++) {
      const n = 2 + int(8);
      const seats = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], int).slice(0, n);
      const players = seats.map((seat, i) => ({
        id: `p${i}`,
        seat,
        // Mix of tiny stacks (blind all-ins) and deep stacks.
        stack: rand() < 0.2 ? 1 + int(30) : 1 + int(3000),
      }));
      const bb = 2 + int(40);
      const sb = 1 + int(bb);
      let s: HandState = startHand({
        handNumber: h,
        players,
        buttonSeat: seats[int(n)]!,
        smallBlind: sb,
        bigBlind: bb,
        deck: shuffle(newDeck(), int),
      });
      const total = players.reduce((a, p) => a + p.stack, 0);
      expect(totalChips(s)).toBe(total);

      let steps = 0;
      while (s.street !== "complete") {
        const legal = legalActions(s)!;
        expect(legal).not.toBeNull();
        const me = s.players[s.toAct!]!;
        expect(me.folded || me.allIn).toBe(false);

        const r = rand();
        let action: Action;
        if (r < 0.1) action = { type: "fold" };
        else if (r < 0.35 && legal.canRaise) {
          const to =
            rand() < 0.3
              ? legal.maxRaiseTo
              : legal.minRaiseTo + int(legal.maxRaiseTo - legal.minRaiseTo + 1);
          action = { type: "raise", to };
        } else action = legal.canCheck ? { type: "check" } : { type: "call" };

        s = applyAction(s, me.id, action);
        steps++;
        expect(steps).toBeLessThan(500);

        expect(totalChips(s)).toBe(total);
        for (const p of s.players) {
          expect(p.stack).toBeGreaterThanOrEqual(0);
          expect(p.bet).toBeLessThanOrEqual(p.committed);
        }

        if (steps % 5 === 0) checkNoLeak(s, s.players[int(n)]!.id);
      }

      // Hand finished: payouts add up to everything that was put in.
      const r = s.result!;
      const paid = Object.values(r.payouts).reduce((a, b) => a + b, 0);
      expect(paid).toBe(s.players.reduce((a, p) => a + p.committed, 0));
      expect(s.players.reduce((a, p) => a + p.stack, 0)).toBe(total);
      if (r.showdown) expect(s.board).toHaveLength(5);
      checkNoLeak(s, s.players[int(n)]!.id);
    }
  });
});

function checkNoLeak(s: HandState, viewerId: string) {
  const json = JSON.stringify(viewFor(s, viewerId));
  const visible = new Set<string>(s.board);
  for (const p of s.players)
    if (p.id === viewerId || (s.result?.showdown && s.result.hands[p.id]))
      p.hole.forEach((c) => visible.add(c));
  for (const c of newDeck()) if (!visible.has(c)) expect(json.includes(`"${c}"`)).toBe(false);
}
