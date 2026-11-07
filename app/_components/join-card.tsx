"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { RoomView } from "@/lib/room";
import { storage } from "@/lib/client/api";
import { ConfirmButton, ShareButtons } from "./bits";
import { useLang } from "./lang";

/** What a guest sees on opening an invite link: who invited them, the table, one name field. */
export function JoinCard({ view, busy, onJoin }: { view: RoomView; busy: boolean; onJoin: (name: string) => void }) {
  const { t } = useLang();
  const [name, setName] = useState("");
  useEffect(() => setName(storage.getName()), []);
  const host = view.players.find((p) => p.isHost)?.name ?? "";
  const seated = view.players.filter((p) => p.seat !== null).length;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && !busy) onJoin(name.trim());
  };
  return (
    <form className="overlay-card join-card" onSubmit={submit}>
      <div className="join-title">{t("invitedBy", { name: host })}</div>
      <div className="small muted num">
        {t("tableInfo", { sb: view.settings.smallBlind, bb: view.settings.bigBlind, n: view.settings.startingStack })}
        {" · "}
        {t("seatedCount", { n: seated })}
      </div>
      <input
        className="input join-input"
        value={name}
        maxLength={20}
        autoComplete="nickname"
        autoFocus
        placeholder={t("namePlaceholder")}
        aria-label={t("yourName")}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn btn-primary btn-block" disabled={!name.trim() || busy}>
        {busy ? t("joining") : t("join")}
      </button>
      <div className="small muted">{t("legal18")}</div>
    </form>
  );
}

/** Before the first hand: the host gets the invite link; seated friends see that they're in. */
export function WaitingCard({
  view,
  busy,
  onCommand,
}: {
  view: RoomView;
  busy: boolean;
  onCommand: (body: Record<string, unknown>) => void;
}) {
  const { t } = useLang();
  const me = view.me;
  const host = view.players.find((p) => p.isHost)?.name ?? "";
  const seated = view.players.filter((p) => p.seat !== null).length;
  if (me?.isHost)
    return (
      <div className="overlay-card">
        <div className="small muted">{t("invite")}</div>
        <div className="big-code">{view.code}</div>
        <ShareButtons code={view.code} showLink />
        <div className="small muted">{t("seatedCount", { n: seated })}</div>
        <ConfirmButton className="btn btn-sm btn-ghost" disabled={busy} onConfirm={() => onCommand({ cmd: "closeRoom" })}>
          {t("closeTable")}
        </ConfirmButton>
      </div>
    );
  return (
    <div className="overlay-card compact">
      <div className="join-title">{me?.seat === null ? t("tableFullWatch") : t("youreSeated", { name: host })}</div>
      <div className="small muted">{t("seatedCount", { n: seated })}</div>
      <details className="invite-more">
        <summary className="small">{t("inviteMore")}</summary>
        <div style={{ marginTop: 8 }}>
          <ShareButtons code={view.code} />
        </div>
      </details>
    </div>
  );
}
