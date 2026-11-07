"use client";
import { useEffect, useRef } from "react";
import type { RoomView } from "../room";
import { playApplause, playChips, playKnock, playSwish, playWin, playYourTurn, say } from "./sound";
import { tableSoundEvents } from "./tableSoundEvents";

/** Plays sounds for what changed on the table since the last view. */
export function useTableSounds(view: RoomView | null, opts: { sound: boolean; voice: boolean }) {
  const prev = useRef<RoomView | null>(null);
  const version = view?.version;

  useEffect(() => {
    const ev = tableSoundEvents(prev.current, view);
    prev.current = view;
    if (!ev) return;
    const { sound, voice } = opts;

    if (sound) {
      if (ev.deal) {
        playSwish(0);
        playSwish(0.14);
      }
      for (const at of ev.boardAt) playSwish(at + 0.05);
      if (ev.action === "check") playKnock();
      else if (ev.action === "fold") playSwish(0);
      else if (ev.action) playChips(ev.action);
      if (ev.myTurn) setTimeout(playYourTurn, 350);
    }
    if (voice && ev.word) say(ev.word);

    // Chime and applause, on the winner's own device only.
    if (ev.winInMs !== null && sound) {
      setTimeout(playWin, ev.winInMs);
      setTimeout(playApplause, ev.winInMs + 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
}
