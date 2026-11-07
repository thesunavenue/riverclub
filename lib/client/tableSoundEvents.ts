import type { RoomView } from "../room";
import { boardPlan } from "./boardPlan";

const WORDS: Record<string, string> = { check: "Check", call: "Call", bet: "Bet", raise: "Raise", fold: "Fold" };

export interface SoundEvents {
  /** A new hand was dealt. */
  deal: boolean;
  /** Seconds (from now) at which a board card is revealed. */
  boardAt: number[];
  /** Sound for the newest action. */
  action: "check" | "fold" | "call" | "raise" | "allin" | null;
  /** Word to say for the newest action. */
  word: string | null;
  /** My turn just started. */
  myTurn: boolean;
  /** I won chips in the hand that just ended: ms to wait (board reveal + spoken word) before cheering. */
  winInMs: number | null;
}

/**
 * What to play for the change from `prev` to `view`. Pure, so it can be tested.
 * Only the viewer's own win counts, so applause plays on the winner's device only.
 */
export function tableSoundEvents(prev: RoomView | null, view: RoomView | null): SoundEvents | null {
  if (!view || !prev || !view.hand) return null;
  const h = view.hand;
  const ph = prev.hand && prev.hand.handNumber === h.handNumber ? prev.hand : null;

  const boardAt =
    ph && h.board.length > ph.board.length
      ? [...boardPlan(ph.board.length, h.board.length).cards.values()].map((c) => c.at)
      : [];

  const fresh = h.log.slice(ph ? ph.log.length : 0).filter((e) => e.type !== "small_blind" && e.type !== "big_blind");
  const last = fresh.at(-1);
  const action: SoundEvents["action"] = !last
    ? null
    : last.type === "check" || last.type === "fold"
      ? last.type
      : last.allIn
        ? "allin"
        : last.type === "bet" || last.type === "raise"
          ? "raise"
          : "call";
  const word = !last ? null : last.allIn ? "All in" : WORDS[last.type] ?? null;

  const myTurn = !!h.legal && !(ph?.legal && ph.log.length === h.log.length);

  const me = view.me?.id;
  let winInMs: number | null = null;
  // The hand just ended (it had no result before, or we only now see it) and I am among the winners.
  if (me && h.result && !ph?.result) {
    const won = (h.result.payouts[me] ?? 0) - (h.players.find((p) => p.id === me)?.committed ?? 0);
    const inPot = h.result.pots.some((pot) => pot.winners.includes(me));
    if (inPot && won > 0) {
      const reveal = ph ? boardPlan(ph.board.length, h.board.length).endsAt : 0;
      winInMs = Math.round(reveal * 1000) + (word ? 700 : 300);
    }
  }

  return { deal: !ph, boardAt, action, word, myTurn, winInMs };
}
