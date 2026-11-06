"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { unlockAudio } from "@/lib/client/sound";

/** Table looks. Each one only swaps colours (see globals.css), so switching is instant and free. */
export const THEMES = ["river", "midnight", "forest", "sunset"] as const;
export type Theme = (typeof THEMES)[number];

interface Prefs {
  theme: Theme;
  sound: boolean;
  voice: boolean;
}
interface PrefsCtx extends Prefs {
  set: (p: Partial<Prefs>) => void;
}

const DEFAULTS: Prefs = { theme: "river", sound: true, voice: true };
const KEY = "riverclub:prefs";
const Ctx = createContext<PrefsCtx | null>(null);

/** Per-device preferences: table theme, sound effects, spoken actions. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
      setPrefs({
        theme: THEMES.includes(saved.theme as Theme) ? (saved.theme as Theme) : DEFAULTS.theme,
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
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

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
