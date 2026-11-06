"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang } from "./lang";

type Unit = "chips" | "bb";
interface ChipsCtx {
  unit: Unit;
  toggle: () => void;
  /** Format a chip amount in the chosen unit: "1,240" or "62 BB". */
  fmt: (amount: number) => string;
}

const Ctx = createContext<ChipsCtx | null>(null);
const KEY = "riverclub:unit";

/** Lets every amount on the table be shown in chips or in big blinds; tap any amount to switch. */
export function ChipsProvider({ bigBlind, children }: { bigBlind: number; children: ReactNode }) {
  const { lang, n } = useLang();
  const [unit, setUnit] = useState<Unit>("chips");

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "bb") setUnit("bb");
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    setUnit((u) => {
      const next = u === "chips" ? "bb" : "chips";
      try {
        localStorage.setItem(KEY, next);
      } catch {}
      return next;
    });
  }, []);

  const value = useMemo<ChipsCtx>(() => {
    const locale = lang === "vi" ? "vi-VN" : "en-US";
    return {
      unit,
      toggle,
      fmt: (amount) =>
        unit === "bb"
          ? `${(amount / bigBlind).toLocaleString(locale, { maximumFractionDigits: 1 })} BB`
          : n(amount),
    };
  }, [unit, toggle, bigBlind, lang, n]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChips(): ChipsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useChips outside ChipsProvider");
  return c;
}

/** A tappable amount that switches the whole table between chips and BB. */
export function Amount({ value, className, prefix }: { value: number; className?: string; prefix?: string }) {
  const { fmt, toggle } = useChips();
  const { t } = useLang();
  return (
    <button
      type="button"
      className={`amt num ${className ?? ""}`}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      title={t("tapAmounts")}
    >
      {prefix}
      {fmt(value)}
    </button>
  );
}
