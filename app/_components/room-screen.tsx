"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Action } from "@/lib/engine";
import { ApiError } from "@/lib/client/api";
import { useRoom } from "@/lib/client/useRoom";
import { ActionBar, statusText } from "./action-bar";
import { copyText, roomUrl, useTicker } from "./bits";
import { ChipsProvider } from "./chips";
import { errorText, useLang } from "./lang";
import { HistorySheet } from "./history-sheet";
import { usePrefs } from "./prefs";
import { ChatSheet, MenuSheet } from "./sheets";
import { useTableSounds } from "@/lib/client/useTableSounds";
import { Table } from "./table";

export function RoomScreen({ code }: { code: string }) {
  const { t } = useLang();
  const router = useRouter();
  const room = useRoom(code);
  const { view } = room;
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; err: boolean } | null>(null);
  const [sheet, setSheet] = useState<"chat" | "menu" | "history" | null>(null);
  const prefs = usePrefs();
  useTableSounds(view, { sound: prefs.sound, voice: prefs.voice });
  const [seenChat, setSeenChat] = useState<string | null>(null);

  const ticking = !!view && (view.turnDeadline !== null || view.nextHandAt !== null);
  const now = useTicker(room.serverNow, ticking);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const lastChat = view?.chat.at(-1);
  useEffect(() => {
    if (sheet === "chat" && lastChat) setSeenChat(lastChat.id);
  }, [sheet, lastChat]);
  const unread = !!lastChat && lastChat.id !== seenChat && lastChat.playerId !== view?.me?.id && sheet !== "chat";

  const run = useCallback(
    async (fn: () => Promise<unknown>): Promise<boolean> => {
      setBusy(true);
      try {
        await fn();
        return true;
      } catch (e) {
        setToast({ text: errorText(t, e instanceof ApiError ? e.code : undefined), err: true });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const command = useCallback((body: Record<string, unknown>) => void run(() => room.command(body)), [run, room]);
  const act = useCallback((a: Action) => void run(() => room.act(a)), [run, room]);
  const leave = useCallback(async () => {
    if (view?.me?.seat !== null && view?.me) await room.command({ cmd: "stand" }).catch(() => {});
    router.push("/");
  }, [room, router, view?.me]);

  async function copyLink() {
    if (await copyText(roomUrl(code))) setToast({ text: t("linkCopied"), err: false });
    else setSheet("menu"); // the menu shows the link for press-and-hold copying
  }

  if (room.status === "notFound" || room.status === "banned" || view?.status === "closed") {
    const msg = room.status === "banned" ? t("removed") : view?.status === "closed" ? t("tableClosed") : t("roomNotFound");
    return (
      <main className="full-msg">
        <div style={{ display: "grid", gap: 16 }}>
          <p>{msg}</p>
          <Link className="btn btn-primary" href="/">
            {t("backHome")}
          </Link>
        </div>
      </main>
    );
  }
  if (!view) return <main className="full-msg muted">…</main>;

  const status = statusText(view, now, t);
  const myTurn = !!view.hand?.legal;

  return (
    <ChipsProvider bigBlind={view.settings.bigBlind}>
      <main className="room">
        <header className="topbar">
          <Link href="/" className="brand-mark" style={{ width: 32, height: 32, fontSize: 16, textDecoration: "none" }} aria-label={t("backHome")}>
            ♠
          </Link>
          <button className="code-btn" onClick={copyLink} aria-label={t("copyLink")}>
            <span className="code-lines">
              <span className="code">
                {view.code} <span className="copy-icon">⧉</span>
              </span>
              <span className="blinds num">
                {t("blindsShort")} {view.settings.smallBlind}/{view.settings.bigBlind}
              </span>
            </span>
          </button>
          <span className="spacer" />
          {view.me && (
            <button className="icon-btn" aria-label={t("history")} onClick={() => setSheet("history")}>
              🕘
            </button>
          )}
          <button className="icon-btn" aria-label={t("chat")} onClick={() => setSheet("chat")}>
            💬{unread && <span className="badge-dot" />}
          </button>
          <button className="icon-btn" aria-label={t("menu")} onClick={() => setSheet("menu")}>
            ☰
          </button>
        </header>

        {room.offline && <div className="banner">{t("offline")}</div>}
        {view.paused && view.status === "playing" && <div className="banner">{t("paused")}</div>}
        <div className={`status-line ${myTurn ? "me" : ""}`} aria-live="polite">
          {status}
        </div>

        <Table view={view} now={now} onSit={(seat) => command({ cmd: "sit", seat })} />

        <ActionBar
          view={view}
          now={now}
          busy={busy}
          onAct={act}
          onJoin={(name) => void run(() => room.join(name))}
          onCommand={command}
          onLeave={() => void leave()}
        />

        {sheet === "chat" && (
          <ChatSheet
            view={view}
            onClose={() => setSheet(null)}
            onSend={(text) => run(() => room.command({ cmd: "chat", text }))}
          />
        )}
        {sheet === "history" && room.token && view.me && (
          <HistorySheet code={code} token={room.token} meId={view.me.id} onClose={() => setSheet(null)} />
        )}
        {sheet === "menu" && (
          <MenuSheet
            view={view}
            busy={busy}
            onClose={() => setSheet(null)}
            onCommand={command}
            onLeave={() => void leave()}
          />
        )}

        {toast && (
          <div className={`toast ${toast.err ? "err" : ""}`} role={toast.err ? "alert" : "status"}>
            {toast.text}
          </div>
        )}
      </main>
    </ChipsProvider>
  );
}
