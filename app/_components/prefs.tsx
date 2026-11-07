"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { unlockAudio } from "@/lib/client/sound";

/** Table looks. Each one only swaps colours (see globals.css), so switching is instant and free. */
export const THEMES = ["river", "slate", "midnight", "forest", "sunset"] as const;
export type Theme = (typeof THEMES)[number];
/** Table shape and rail. */
export const TABLES = ["soft", "classic", "wood"] as const;
export type TableStyle = (typeof TABLES)[number];
/** Card faces: four-colour suits, classic red/black, or colour-filled faces. */
export const DECKS = ["four", "two", "tint"] as const;
export type Deck = (typeof DECKS)[number];

interface Prefs {
  theme: Theme;
  table: TableStyle;
  deck: Deck;
  sound: boolean;
  voice: boolean;
}
interface PrefsCtx extends Prefs {
  set: (p: Partial<Prefs>) => void;
}

const DEFAULTS: Prefs = { theme: "river", table: "soft", deck: "four", sound: true, voice: true };

function pick<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}
const KEY = "riverclub:prefs";
const Ctx = createContext<PrefsCtx | null>(null);

/** Per-device preferences: table theme, sound effects, spoken actions. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
      setPrefs({
        theme: pick(THEMES, saved.theme, DEFAULTS.theme),
        table: pick(TABLES, saved.table, DEFAULTS.table),
        deck: pick(DECKS, saved.deck, DEFAULTS.deck),
        sound: typeof saved.sound === "boolean" ? saved.sound : DEFAULTS.sound,
        voice: typeof saved.voice === "boolean" ? saved.voice : DEFAULTS.voice,
      });
    } catch {}
    // Browsers only allow sound after the first tap.
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    const root = document.documentElement.dataset;
    root.theme = prefs.theme;
    root.table = prefs.table;
    root.deck = prefs.deck;
  }, [prefs.theme, prefs.table, prefs.deck]);

  const set = useCallback((p: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...prefs, set }), [prefs, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrefs outside PrefsProvider");
  return c;
}
