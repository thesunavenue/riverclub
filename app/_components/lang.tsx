"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { STRINGS, format, formatChips, type Lang, type StringKey } from "@/lib/i18n/strings";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  /** Format a chip amount for the current language (1,000 / 1.000). */
  n: (amount: number) => string;
}

const Ctx = createContext<LangCtx | null>(null);
const KEY = "rivercrew:lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {}
    const initial: Lang =
      stored === "vi" || stored === "en" ? stored : navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en";
    setLangState(initial);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);

  const value = useMemo<LangCtx>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => format(STRINGS[lang][key], vars),
      n: (amount) => formatChips(amount, lang),
    }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLang outside LangProvider");
  return c;
}

/** Localized message for an API error code. */
export function errorText(t: LangCtx["t"], code: string | undefined): string {
  const key = `err_${code}` as StringKey;
  return key in STRINGS.en ? t(key) : t("err_GENERIC");
}
