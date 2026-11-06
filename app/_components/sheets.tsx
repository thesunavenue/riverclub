"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RoomView } from "@/lib/room";
import { AVATARS } from "@/lib/room";
import { ConfirmButton, LangSwitch, Sheet, ShareButtons } from "./bits";
import { THEMES, usePrefs } from "./prefs";
import { useLang } from "./lang";

const EMOJI = ["👍", "😂", "😮", "🔥", "🙈", "🎉"];

export function ChatSheet({
  view,
  onClose,
  onSend,
}: {
  view: RoomView;
  onClose: () => void;
  onSend: (text: string) => Promise<boolean>;
}) {
  const { t } = useLang();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [view.chat.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) return;
    if (await onSend(msg)) setText("");
  }

  return (
    <Sheet title={t("chat")} onClose={onClose}>
      <div className="chat-list" ref={listRef}>
        {view.chat.length === 0 && <div className="muted small">{t("noMessages")}</div>}
        {view.chat.map((m) => (
          <div key={m.id} className={`msg ${m.playerId === view.me?.id ? "mine" : ""}`}>
            <div className="who">{m.name}</div>
            {m.text}
          </div>
        ))}
      </div>
      {view.me && (
        <>
          <div className="emoji-row">
            {EMOJI.map((em) => (
              <button key={em} type="button" onClick={() => void onSend(em)} aria-label={em}>
                {em}
              </button>
            ))}
          </div>
          <form className="chat-form" onSubmit={submit}>
            <input
              className="input"
              value={text}
              maxLength={200}
              placeholder={t("typeMessage")}
              aria-label={t("typeMessage")}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn btn-primary">{t("send")}</button>
          </form>
        </>
      )}
    </Sheet>
  );
}

export function MenuSheet({
  view,
  busy,
  onClose,
  onCommand,
  onLeave,
}: {
  view: RoomView;
  busy: boolean;
  onClose: () => void;
  onCommand: (body: Record<string, unknown>) => void;
  onLeave: () => void;
}) {
  const { t, n } = useLang();
  const me = view.me;
  const isHost = !!me?.isHost;
  const hostName = view.players.find((p) => p.isHost)?.name ?? "";
  const prefs = usePrefs();
  const others = view.players.filter((p) => p.id !== me?.id);

  return (
    <Sheet title={t("menu")} onClose={onClose}>
      <div className="list-row">
        <span className="grow">{t("language")}</span>
        <LangSwitch />
      </div>

      <div className="list">
        <p className="section-title">{t("theme")}</p>
        <div className="theme-row">
          {THEMES.map((th) => (
            <button
              key={th}
              className={`theme-chip theme-${th}`}
              aria-pressed={prefs.theme === th}
              onClick={() => prefs.set({ theme: th })}
            >
              <span className="swatch" aria-hidden />
              {t(`theme_${th}`)}
            </button>
          ))}
        </div>
        <label className="list-row toggle">
          <span className="grow">{t("soundFx")}</span>
          <input type="checkbox" checked={prefs.sound} onChange={(e) => prefs.set({ sound: e.target.checked })} />
        </label>
        <label className="list-row toggle">
          <span className="grow">{t("voiceActions")}</span>
          <input type="checkbox" checked={prefs.voice} onChange={(e) => prefs.set({ voice: e.target.checked })} />
        </label>
      </div>

      {me && (
        <div className="list">
          <p className="section-title">{t("avatar")}</p>
          <div className="avatar-grid">
            {AVATARS.map((a) => (
              <button
                key={a}
                className="avatar-pick"
                aria-pressed={me.avatar === a}
                disabled={busy}
                onClick={() => onCommand({ cmd: "setAvatar", avatar: a })}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="list">
        <p className="section-title">
          {t("invite")} · {view.code}
        </p>
        <ShareButtons code={view.code} showLink />
      </div>

      <div className="list-row">
        <span className="grow">
          {t("host")}: <b>{hostName}</b>
        </span>
      </div>

      {me && me.seat !== null && (
        <div className="bar-row" style={{ display: "grid", gridAutoFlow: "column", gap: 8 }}>
          <button
            className="btn btn-sm"
            disabled={busy}
            onClick={() => onCommand({ cmd: "setAway", targetId: me.id, away: !me.away })}
          >
            {me.away ? t("imBack") : t("sitOut")}
          </button>
          <button className="btn btn-sm btn-danger" disabled={busy || me.leaving} onClick={() => onCommand({ cmd: "stand" })}>
            {t("leaveSeat")}
          </button>
        </div>
      )}

      {isHost && (
        <div className="list">
          <p className="section-title">{t("hostControls")}</p>
          {view.status === "playing" && (
            <button className="btn btn-sm" disabled={busy} onClick={() => onCommand({ cmd: "setPaused", paused: !view.paused })}>
              {view.paused ? t("resume") : t("pauseAfterHand")}
            </button>
          )}
          {view.status === "finished" && (
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => onCommand({ cmd: "playAgain" })}>
              {t("playAgain")}
            </button>
          )}
          <ConfirmButton className="btn btn-sm btn-danger" disabled={busy} onConfirm={() => onCommand({ cmd: "closeRoom" })}>
            {t("closeTable")}
          </ConfirmButton>


          {others.length > 0 && <p className="section-title">{t("players")}</p>}
          {others.map((p) => (
            <div key={p.id} className="list-row wrap">
              <span className="grow">
                {p.name} <span className="muted small num">· {n(p.stack)}</span>
              </span>
              {p.seat !== null && (
                <button
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => onCommand({ cmd: "setAway", targetId: p.id, away: !p.away })}
                >
                  {p.away ? t("imBack") : t("sitOut")}
                </button>
              )}
              <button className="btn btn-sm" disabled={busy} onClick={() => onCommand({ cmd: "transferHost", targetId: p.id })}>
                {t("makeHost")}
              </button>
              <ConfirmButton
                className="btn btn-sm btn-danger"
                disabled={busy}
                onConfirm={() => onCommand({ cmd: "kick", targetId: p.id })}
              >
                {t("remove")}
              </ConfirmButton>
            </div>
          ))}
        </div>
      )}

      {!isHost && (
        <button className="btn btn-sm" onClick={onLeave}>
          {t("leaveTable")}
        </button>
      )}

      <p className="legal">{t("legal18")}</p>
    </Sheet>
  );
}
