"use client";
import { useEffect, useState } from "react";
import type { Action } from "@/lib/engine";
import type { RoomView } from "@/lib/room";
import { Card, ConfirmButton } from "./bits";
import { useChips } from "./chips";
import { useLang } from "./lang";

interface Props {
  view: RoomView;
  now: number;
  busy: boolean;
  onAct: (a: Action) => void;
  onCommand: (body: Record<string, unknown>) => void;
  onLeave: () => void;
}

/** Bottom bar in the thumb zone. Shows exactly what you can do right now. */
export function ActionBar({ view, now, busy, onAct, onCommand, onLeave }: Props) {
  const { t } = useLang();
  const { fmt } = useChips();
  const me = view.me;
  const hand = view.hand;
  const legal = hand?.legal ?? null;
  const [raising, setRaising] = useState(false);
  const [amount, setAmount] = useState(0);
  const hostName = view.players.find((p) => p.isHost)?.name ?? "";

  // Close the raise panel whenever the turn changes.
  useEffect(() => setRaising(false), [hand?.handNumber, hand?.log.length]);

  // 1. Not in the room yet: the join card on the table has the name field.
  if (!me)
    return (
      <div className="bar">
        <div className="bar-row">
          <div className="note">{t("joinHint")}</div>
        </div>
      </div>
    );

  // 2. My turn.
  if (legal) {
    const isBet = (hand?.currentBet ?? 0) === 0;
    const callIsAllIn = legal.canCall && legal.callAmount >= (me.stack ?? 0);

    if (raising && legal.canRaise) {
      const pot = hand?.pot ?? 0;
      const clamp = (x: number) => Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(x)));
      const potTo = (f: number) => clamp((hand?.currentBet ?? 0) + (pot + legal.callAmount) * f);
      const value = clamp(amount || legal.minRaiseTo);
      const isAllIn = value === legal.maxRaiseTo;
      const label = isAllIn
        ? t("allInN", { n: fmt(value) })
        : isBet
          ? t("betTo", { n: fmt(value) })
          : t("raiseTo", { n: fmt(value) });
      return (
        <div className="bar raise-panel">
          <input
            type="range"
            min={legal.minRaiseTo}
            max={legal.maxRaiseTo}
            step={1}
            value={value}
            aria-label={label}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <div className="presets">
            <button className="btn btn-sm" onClick={() => setAmount(legal.minRaiseTo)}>
              {t("min")}
            </button>
            <button className="btn btn-sm" onClick={() => setAmount(potTo(0.5))}>
              {t("halfPot")}
            </button>
            <button className="btn btn-sm" onClick={() => setAmount(potTo(1))}>
              {t("fullPot")}
            </button>
            <button className="btn btn-sm" onClick={() => setAmount(legal.maxRaiseTo)}>
              {t("allIn")}
            </button>
          </div>
          <div className="bar-row">
            <button className="btn" onClick={() => setRaising(false)}>
              {t("cancel")}
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={() => onAct({ type: "raise", to: value })}>
              {label}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="bar">
        <div className="bar-row">
          <button className="btn btn-danger" disabled={busy} onClick={() => onAct({ type: "fold" })}>
            {t("fold")}
          </button>
          {legal.canCheck ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => onAct({ type: "check" })}>
              {t("check")}
            </button>
          ) : (
            <button className="btn btn-primary" disabled={busy} onClick={() => onAct({ type: "call" })}>
              {callIsAllIn ? t("allInN", { n: fmt(legal.callAmount) }) : t("call", { n: fmt(legal.callAmount) })}
            </button>
          )}
          {legal.canRaise && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                setAmount(legal.minRaiseTo);
                setRaising(true);
              }}
            >
              {isBet ? t("bet") : t("raise")}
            </button>
          )}
        </div>
      </div>
    );
  }

  // 3. Game over: host decides what's next; everyone else may leave.
  if (view.status === "finished") {
    return (
      <div className="bar">
        {me.isHost ? (
          <div className="bar-row">
            <ConfirmButton className="btn" disabled={busy} onConfirm={() => onCommand({ cmd: "closeRoom" })}>
              {t("closeTable")}
            </ConfirmButton>
            <button className="btn btn-primary" disabled={busy} onClick={() => onCommand({ cmd: "playAgain" })}>
              {t("playAgain")}
            </button>
          </div>
        ) : (
          <div className="bar-row" style={{ gridTemplateColumns: "1fr auto", gridAutoFlow: "row" }}>
            <div className="note">{t("waitingHostShort", { name: hostName })}</div>
            <button className="btn" onClick={onLeave}>
              {t("leaveTable")}
            </button>
          </div>
        )}
      </div>
    );
  }

  // 4. Everything else: one clear next step or a status note,
  //    plus "show your cards" after folding or after a hand you didn't have to show.
  const myHp = hand?.players.find((p) => p.id === me.id);
  const canShow =
    !!hand &&
    !!myHp?.hole &&
    view.status === "playing" &&
    (myHp.folded || hand.street === "complete") &&
    !hand.result?.hands[me.id];
  const handOver = hand?.street === "complete";
  const shownNow = me.shown ?? [null, null];
  const [pick0, pick1] = [!!shownNow[0], !!shownNow[1]];
  const showRow = canShow ? (
    <div style={{ display: "grid", gap: 4 }}>
      <div className="show-row">
        <span className="label">{t("showOff")}</span>
        {[0, 1].map((i) => (
          <button
            key={i}
            className="btn btn-sm"
            disabled={busy}
            aria-pressed={i === 0 ? pick0 : pick1}
            onClick={() => onCommand({ cmd: "show", cards: [i] })}
          >
            <Card card={myHp!.hole![i]} size="sm" />
          </button>
        ))}
        <button
          className="btn btn-sm"
          disabled={busy}
          aria-pressed={pick0 && pick1}
          onClick={() => onCommand({ cmd: "show", cards: [0, 1] })}
        >
          {t("showBoth")}
        </button>
      </div>
      {!handOver && <div className="small muted" style={{ textAlign: "center" }}>{t("showAfterHand")}</div>}
    </div>
  ) : null;

  const seatedWithChips = view.players.filter((p) => p.seat !== null && p.stack > 0 && !p.away).length;
  let content: React.ReactNode;
  if (me.seat === null) content = <div className="note">{t("pickSeat")}</div>;
  else if (me.out) content = <div className="note">{t("busted")}</div>;
  else if (me.away)
    content = (
      <div style={{ display: "grid", gap: 6 }}>
        <div className="note small">{t("awayHint")}</div>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => onCommand({ cmd: "setAway", targetId: me.id, away: false })}
        >
          {t("imBack")}
        </button>
      </div>
    );
  else if (view.status === "waiting" && me.isHost)
    content = (
      <button
        className="btn btn-primary"
        disabled={busy || seatedWithChips < 2}
        onClick={() => onCommand({ cmd: "startGame" })}
      >
        {seatedWithChips < 2 ? t("needTwo") : t("startGame")}
      </button>
    );
  else content = <div className="note">{statusText(view, now, t)}</div>;

  return (
    <div className="bar">
      {showRow}
      <div className="bar-row">{content}</div>
    </div>
  );
}

export function statusText(view: RoomView, now: number, t: ReturnType<typeof useLang>["t"]): string {
  const hand = view.hand;
  const hostName = view.players.find((p) => p.isHost)?.name ?? "";
  if (hand && hand.street !== "complete" && hand.toActId) {
    if (hand.toActId === view.me?.id) return t("yourTurn");
    const name = view.players.find((p) => p.id === hand.toActId)?.name ?? "";
    return t("waitingFor", { name });
  }
  if (view.status === "finished") return t("gameOver");
  if (view.paused) return t("paused");
  if (view.status === "waiting") return view.me?.isHost ? "" : t("waitingHost", { name: hostName });
  if (view.nextHandAt) {
    const s = Math.ceil((view.nextHandAt - now) / 1000);
    const ready = view.players.filter((p) => p.seat !== null && p.stack > 0 && !p.away && !p.leaving).length;
    if (ready < 2) return t("needTwo");
    if (s > 0) return t("nextHandIn", { s });
  }
  if (!view.me) return t("watching");
  if (view.me.seat === null) return t("pickSeat");
  return "";
}
