import type { Card } from "./cards";
import { evaluateBest, type HandValue } from "./evaluate";
import type { HandResult, PlayerState, PotResult, ShowdownHand } from "./types";

export const MAX_SEATS = 9;

export interface Pot {
  amount: number;
  /** Ids of non-folded players who can win this pot. */
  eligible: string[];
}

/**
 * Split all committed chips into main pot and side pots.
 * Folded players' chips go into the pots but they are not eligible.
 * Chips nobody else matched form a pot with one eligible player (i.e. they are returned).
 */
export function buildPots(players: PlayerState[]): Pot[] {
  const levels = [...new Set(players.map((p) => p.committed).filter((c) => c > 0))].sort(
    (a, b) => a - b,
  );
  const pots: Pot[] = [];
  let prev = 0;
  let carry = 0;
  for (const level of levels) {
    let amount = carry;
    carry = 0;
    for (const p of players) amount += Math.min(p.committed, level) - Math.min(p.committed, prev);
    const eligible = players.filter((p) => !p.folded && p.committed >= level).map((p) => p.id);
    prev = level;
    if (eligible.length === 0) {
      // Only folded players reached this level: give the chips to the pot below.
      const last = pots[pots.length - 1];
      if (last) last.amount += amount;
      else carry = amount;
      continue;
    }
    const last = pots[pots.length - 1];
    if (last && sameIds(last.eligible, eligible)) last.amount += amount;
    else pots.push({ amount, eligible });
  }
  return pots;
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Order for odd chips: first seat left of the button gets the first odd chip. */
function seatDistanceFromButton(seat: number, buttonSeat: number): number {
  return (seat - buttonSeat - 1 + MAX_SEATS * 2) % MAX_SEATS;
}

/** Decide winners of every pot. Pure: does not modify `players`. */
export function settlePots(players: PlayerState[], board: Card[], buttonSeat: number): HandResult {
  const live = players.filter((p) => !p.folded);
  const showdown = live.length >= 2;
  const values = new Map<string, HandValue>();
  const hands: Record<string, ShowdownHand> = {};
  if (showdown) {
    for (const p of live) {
      const v = evaluateBest([...p.hole, ...board]);
      values.set(p.id, v);
      hands[p.id] = { category: v.category, cards: v.cards };
    }
  }

  const seatOf = new Map(players.map((p) => [p.id, p.seat]));
  const payouts: Record<string, number> = {};
  for (const p of players) payouts[p.id] = 0;

  const pots: PotResult[] = buildPots(players).map((pot) => {
    let winners: string[];
    if (pot.eligible.length === 1 || !showdown) {
      winners = pot.eligible.slice(0, 1);
    } else {
      const best = Math.max(...pot.eligible.map((id) => values.get(id)!.score));
      winners = pot.eligible.filter((id) => values.get(id)!.score === best);
    }
    winners.sort(
      (a, b) =>
        seatDistanceFromButton(seatOf.get(a)!, buttonSeat) -
        seatDistanceFromButton(seatOf.get(b)!, buttonSeat),
    );
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const id of winners) {
      payouts[id]! += share + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
    }
    return { amount: pot.amount, eligible: pot.eligible, winners };
  });

  return { showdown, pots, payouts, hands };
}
