import type { HandView } from "@/lib/engine";

/**
 * What each winner actually won from others, for display.
 * A bet nobody called is just handed back, so it is not counted.
 */
export function winnings(hand: HandView): [string, number][] {
  const r = hand.result;
  if (!r) return [];
  const uncalled = (id: string) => {
    const mine = hand.players.find((p) => p.id === id)?.committed ?? 0;
    const others = hand.players.filter((p) => p.id !== id).map((p) => p.committed);
    return Math.max(0, mine - Math.max(0, ...others));
  };
  return Object.entries(r.payouts)
    .map(([id, amt]) => [id, amt - uncalled(id)] as [string, number])
    .filter(([, amt]) => amt > 0);
}
