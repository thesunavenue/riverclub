"use client";
import { useEffect, useRef } from "react";
import type { RoomView } from "../room";
import { playApplause, playChips, playKnock, playSwish, playWin, playYourTurn, say } from "./sound";

const WORDS: Record<string, string> = { check: "Check", call: "Call", bet: "Bet", raise: "Raise", fold: "Fold" };

/** Plays sounds for what changed on the table since the last view. */
export function useTableSounds(view: RoomView | null, opts: { sound: boolean; voice: boolean }) {
  const prev = useRef<RoomView | null>(null);
  const version = view?.version;

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!view || !p || !view.hand) return;
    const h = view.hand;
    const ph = p.hand && p.hand.handNumber === h.handNumber ? p.hand : null;
    const { sound, voice } = opts;

    // New hand: two cards dealt to everyone.
    if (!ph && sound) {
      playSwish(0);
      playSwish(0.14);
    }
    // New board cards (flop = 3).
    const newBoard = h.board.length - (ph?.board.length ?? 0);
    if (ph && newBoard > 0 && sound) for (let i = 0; i < newBoard; i++) playSwish(0.25 + i * 0.12);

    // The newest action: one sound and one word, even if several happened at once.
    const fresh = h.log.slice(ph ? ph.log.length : 0).filter((e) => e.type !== "small_blind" && e.type !== "big_blind");
    const last = fresh.at(-1);
    if (last) {
      if (sound) {
        if (last.type === "check") playKnock();
        else if (last.type === "fold") playSwish(0);
        else playChips();
      }
      if (voice) say(last.allIn ? "All in" : WORDS[last.type] ?? "");
    }

    // My turn just started.
    if (h.legal && !(ph?.legal && ph.log.length === h.log.length) && sound) setTimeout(playYourTurn, 350);

    // I won something: chime and applause, on my device only.
    const me = view.me?.id;
    if (h.result && !ph?.result && me && h.result.pots.some((pot) => pot.winners.includes(me)) && sound) {
      setTimeout(playWin, 400);
      setTimeout(playApplause, 650);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
}
