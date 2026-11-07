"use client";
import type { HandView, LogEntry } from "@/lib/engine";
import type { RoomPlayerView, RoomView } from "@/lib/room";
import type { StringKey } from "@/lib/i18n/strings";
import { Card, TimerRing } from "./bits";
import { JoinCard, WaitingCard } from "./join-card";
import { Amount, useChips } from "./chips";
import { useLang } from "./lang";
import { winnings } from "./winnings";

/**
 * Seat slots around a portrait oval, as % of the table area. Slot 0 is bottom centre (you),
 * then clockwise: bottom-left, left, top-left, top, top-right, right, bottom-right.
 */
const SLOTS: [number, number][] = [
  [50, 93],
  [14, 79],
  [10, 54],
  [13, 29],
  [30, 8],
  [70, 8],
  [87, 29],
  [90, 54],
  [86, 79],
];
const CENTER: [number, number] = [50, 46];

/** "+4BB" style: winnings in big blinds read at a glance. */
function bbText(amount: number, bigBlind: number): string {
  const bb = Math.round((amount / bigBlind) * 10) / 10;
  return `${bb}BB`;
}

function slotOf(seat: number, mySeat: number): [number, number] {
  return SLOTS[(seat - mySeat + 9) % 9]!;
}

function toward(p: [number, number], f: number): [number, number] {
  return [p[0] + (CENTER[0] - p[0]) * f, p[1] + (CENTER[1] - p[1]) * f];
}

/** Each player's latest action on the current street (or the whole hand once it ended). */
function lastActions(hand: HandView): Map<string, LogEntry> {
  const m = new Map<string, LogEntry>();
  for (const e of hand.log) {
    if (hand.street !== "complete" && e.street !== hand.street) continue;
    if (e.type === "small_blind" || e.type === "big_blind") continue;
    m.set(e.playerId, e);
  }
  return m;
}

interface TableProps {
  view: RoomView;
  now: number;
  busy: boolean;
  onSit: (seat: number) => void;
  onJoin: (name: string) => void;
  onCommand: (body: Record<string, unknown>) => void;
}

export function Table({ view, now, busy, onSit, onJoin, onCommand }: TableProps) {
  const { t } = useLang();
  const { fmt } = useChips();
  const me = view.me;
  const mySeat = me?.seat ?? 0;
  const hand = view.hand;
  const active = !!hand && hand.street !== "complete";
  const bySeat = new Map<number, RoomPlayerView>();
  for (const p of view.players) if (p.seat !== null) bySeat.set(p.seat, p);
  const handPlayer = (id: string) => hand?.players.find((p) => p.id === id);
  const last = hand ? lastActions(hand) : new Map<string, LogEntry>();
  const winners = new Set(hand?.result?.pots.flatMap((p) => p.winners) ?? []);
  const canSit = !!me && me.seat === null && view.status !== "finished";
  const mine = me ? handPlayer(me.id) : undefined;
  const myShown = hand?.result?.hands[me?.id ?? ""];

  const gains = new Map<string, number>();
  if (hand?.result)
    for (const hp of hand.players) {
      const won = (hand.result.payouts[hp.id] ?? 0) - hp.committed;
      if (won > 0) gains.set(hp.id, won);
    }
  const msLeft = active && view.turnDeadline ? Math.max(0, view.turnDeadline - now) : 0;
  const turnLeft = msLeft / (view.settings.turnSeconds * 1000);

  function actionLabel(e: LogEntry | undefined): string | null {
    if (!e) return null;
    if (e.allIn) return t("logAllIn");
    const map: Partial<Record<LogEntry["type"], StringKey>> = {
      check: "logCheck",
      call: "logCall",
      fold: "logFold",
      bet: "logBet",
      raise: "logRaise",
    };
    const key = map[e.type];
    return key ? t(key, { n: fmt(e.amount ?? 0) }) : null;
  }

  return (
    <div className="table-wrap">
      <div className="table" />

      {/* centre: board, pot, result */}
      <div className="center">
        <div className="board">
          {[0, 1, 2, 3, 4].map((i) => {
            const c = hand?.board[i];
            return (
              <span key={c ? `${hand!.handNumber}-${c}` : `slot-${i}`} className={c ? "anim-flip" : ""} style={{ animationDelay: `${(i % 3) * 90}ms` }}>
                <Card card={c} />
              </span>
            );
          })}
        </div>
        {active && hand.pot > 0 && (
          <span key={`pot-${hand.pot}`} className="anim-pulse">
            <Amount className="pot" value={hand.pot} prefix={`${t("pot", { n: "" }).trim()} `} />
          </span>
        )}
        {hand?.result && view.status !== "finished" && (
          <div className="fade-late" key={`res-${hand.handNumber}`}>
            <Result hand={hand} players={view.players} />
          </div>
        )}
      </div>

      {/* a guest from an invite link: name, then straight to a seat */}
      {!me && view.status !== "finished" && <JoinCard view={view} busy={busy} onJoin={onJoin} />}
      {/* before the first hand: invite link for the host, "you're in" for friends */}
      {me && view.status === "waiting" && <WaitingCard view={view} busy={busy} onCommand={onCommand} />}

      {/* game over */}
      {view.status === "finished" && <GameOver view={view} />}

      {/* seats */}
      {Array.from({ length: 9 }, (_, seat) => {
        const p = bySeat.get(seat);
        const [x, y] = slotOf(seat, mySeat);
        if (!p) {
          if (!canSit) return null; // only show empty seats to someone looking for one
          return (
            <button
              key={seat}
              className="empty-seat can-sit"
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => onSit(seat)}
              aria-label={`${t("sit")} ${seat + 1}`}
            >
              {t("sit")}
            </button>
          );
        }
        const hp = handPlayer(p.id);
        const isMe = p.id === me?.id;
        const isTurn = active && hand.toActId === p.id;
        const cls = [
          "seat",
          isTurn ? "turn" : "",
          hp?.folded || p.out ? "folded" : "",
          p.away ? "away" : "",
          hand?.result && winners.has(p.id) ? "winner" : "",
        ].join(" ");
        const label = actionLabel(last.get(p.id));
        return (
          <div key={seat} className={cls} style={{ left: `${x}%`, top: `${y}%` }}>
            {!isMe && hp && !hp.folded && (hp.hole || active) && (
              <div className="seat-cards anim-deal" key={`deal-${hand?.handNumber}`}>
                <Card card={hp.hole?.[0] ?? null} size="sm" />
                <Card card={hp.hole?.[1] ?? null} size="sm" />
              </div>
            )}
            <div className="avatar">
              <span className="emoji" aria-hidden>
                {p.avatar}
              </span>
              {p.isHost && (
                <span className="host-mark" title={t("host")} aria-label={t("host")}>
                  ★
                </span>
              )}
              {hand && hand.buttonSeat === seat && <span className="dealer-btn">{t("dealer")}</span>}
              {active && hp && hand.smallBlindSeat === seat && <span className="pos-tag">{t("sbTag")}</span>}
              {active && hp && hand.bigBlindSeat === seat && <span className="pos-tag bb">{t("bbTag")}</span>}
              {isTurn && <TimerRing left={turnLeft} seconds={Math.ceil(msLeft / 1000)} />}
            </div>
            <div className="name">{p.name}</div>
            {gains.has(p.id) && (
              <span key={`gain-${hand?.handNumber}`} className="gain num">
                +{bbText(gains.get(p.id)!, view.settings.bigBlind)}
              </span>
            )}
            <Amount className="stack" value={p.stack} />
            {p.out ? (
              <div className="tag">{t("outTag")}</div>
            ) : label && !isTurn ? (
              <div className="last anim-pop" key={`${label}-${hand?.log.length}`}>
                {label}
              </div>
            ) : p.away || p.leaving ? (
              <div className="tag">{p.leaving ? t("leaving") : t("sittingOut")}</div>
            ) : null}
          </div>
        );
      })}

      {/* bets in front of players */}
      {active &&
        hand.players
          .filter((hp) => hp.bet > 0)
          .map((hp) => {
            const [x, y] = toward(slotOf(hp.seat, mySeat), 0.55);
            return (
              <span key={`${hp.id}-${hp.bet}`} className="bet-pos anim-chip" style={{ left: `${x}%`, top: `${y}%` }}>
                <Amount className="bet-chip" value={hp.bet} />
              </span>
            );
          })}

      {/* my cards, large */}
      {mine?.hole && view.status !== "finished" && (
        <div className="my-cards" key={`mine-${hand?.handNumber}`}>
          <span className="anim-deal">
            <Card card={mine.hole[0]} size="lg" dim={mine.folded} />
          </span>
          <span className="anim-deal" style={{ animationDelay: "120ms" }}>
            <Card card={mine.hole[1]} size="lg" dim={mine.folded} />
          </span>
          {myShown && <div className="my-hand-name">{t(myShown.category)}</div>}
        </div>
      )}
    </div>
  );
}

function Result({ hand, players }: { hand: HandView; players: RoomPlayerView[] }) {
  const { t } = useLang();
  const { fmt } = useChips();
  const r = hand.result!;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const shown = winnings(hand);
  return (
    <div className="result">
      {shown.map(([id, amt]) => (
        <div key={id}>
          <b>{t("wins", { name: nameOf(id), n: fmt(amt) })}</b>
          {r.showdown && r.hands[id] ? ` · ${t(r.hands[id].category)}` : ""}
        </div>
      ))}
    </div>
  );
}

function GameOver({ view }: { view: RoomView }) {
  const { t } = useLang();
  const winner = view.standings.find((s) => s.place === 1);
  return (
    <div className="overlay-card">
      <div className="small muted">{t("gameOver")}</div>
      <div className="trophy" aria-hidden>
        🏆
      </div>
      {winner && <div className="winner-line">{t("winsGame", { name: winner.name })}</div>}
      <ol className="standings">
        {view.standings.map((s) => (
          <li key={s.playerId} className={s.playerId === view.me?.id ? "me" : ""}>
            <span className="place num">#{s.place}</span>
            <span className="grow">{s.name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
