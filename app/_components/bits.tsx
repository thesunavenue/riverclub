"use client";
import { useEffect, useState, type ReactNode } from "react";
import { LANGS } from "@/lib/i18n/strings";
import { useLang } from "./lang";

// U+FE0E asks for the text (not emoji) form, so iOS doesn't draw ♥ ♦ as emoji.
const SUIT_SYMBOL: Record<string, string> = { s: "♠︎", h: "♥︎", d: "♦︎", c: "♣︎" };

/** Playing card drawn with CSS and text only: no images to download. */
export function Card({ card, size, dim }: { card?: string | null; size?: "sm" | "lg"; dim?: boolean }) {
  const cls = ["card", size ?? "", dim ? "dim" : ""].join(" ");
  if (card === undefined) return <span className={`${cls} slot`} aria-hidden />;
  if (card === null) return <span className={`${cls} back`} aria-label="hidden card" />;
  const rank = card[0] === "T" ? "10" : card[0];
  const suit = card[1]!;
  return (
    <span className={`${cls} s-${suit}`} aria-label={card}>
      <span className="c-r">{rank}</span>
      <span className="c-s">{SUIT_SYMBOL[suit]}</span>
      <span className="c-big">{SUIT_SYMBOL[suit]}</span>
    </span>
  );
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="seg" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useLang();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("close")}
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Re-renders every `ms` while `active`, returning the current server-time estimate. */
export function useTicker(serverNow: () => number, active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    setNow(serverNow());
    if (!active) return;
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [serverNow, active, ms]);
  return now;
}

export function roomUrl(code: string): string {
  return typeof window === "undefined" ? `/r/${code}` : `${window.location.origin}/r/${code}`;
}

/**
 * Copy text. The Clipboard API only exists on https (and localhost), so on plain http
 * (testing over Wi-Fi) fall back to the old select-and-copy trick, which phones still support.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Copy + native share for the room link, with the link itself visible as a last resort. */
export function ShareButtons({ code, showLink }: { code: string; showLink?: boolean }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const url = roomUrl(code);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  async function copy() {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      // Some in-app browsers block copying: the link is shown above for press-and-hold.
      setFailed(true);
    }
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {showLink && (
        <div className="link-text small" onClick={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)}>
          {url}
        </div>
      )}
      {failed && <div className="small muted">{t("copyFailed")}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-sm" style={{ flex: 1 }} onClick={copy}>
          {copied ? t("copied") : t("copyLink")}
        </button>
        {canShare && (
          <button
            className="btn btn-sm"
            style={{ flex: 1 }}
            onClick={() => navigator.share({ title: "RiverClub", text: t("shareText"), url }).catch(() => {})}
          >
            {t("share")}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A button that needs two taps: the first arms it, the second runs it.
 * Used instead of window.confirm(), which some in-app browsers block.
 */
export function ConfirmButton({
  className,
  disabled,
  onConfirm,
  children,
}: {
  className?: string;
  disabled?: boolean;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      className={`${className ?? "btn"} ${armed ? "armed" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? t("tapToConfirm") : children}
    </button>
  );
}

/** Small countdown ring with the seconds left inside. `left` goes from 1 to 0. */
/** Countdown ring around the avatar: green, then orange, then red as time runs out. */
export function TimerRing({ left, seconds }: { left: number; seconds: number }) {
  const p = Math.max(0, Math.min(1, left));
  const level = p > 0.5 ? "ok" : p > 0.25 ? "warn" : "low";
  const C = 2 * Math.PI * 16;
  return (
    <span className={`ring ${level}`} role="timer" aria-label={`${seconds}s`}>
      <svg viewBox="0 0 36 36" aria-hidden>
        <circle className="track" cx="18" cy="18" r="16" />
        <circle
          className="bar"
          cx="18"
          cy="18"
          r="16"
          transform="rotate(-90 18 18)"
          style={{ strokeDasharray: `${p * C} ${C}` }}
        />
      </svg>
      <b className="num">{seconds}</b>
    </span>
  );
}
