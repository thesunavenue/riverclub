"use client";
import { useEffect, useState } from "react";
import type { LogEntry, Street } from "@/lib/engine";
import type { HistoryItem } from "@/lib/room";
import { api, ApiError } from "@/lib/client/api";
import type { StringKey } from "@/lib/i18n/strings";
import { Card, Sheet } from "./bits";
import { useChips } from "./chips";
import { errorText, useLang } from "./lang";
import { winnings } from "./winnings";

const STREETS = ["preflop", "flop", "turn", "river"] as const satisfies readonly Street[];
const BOARD_AT: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

/** The last 20 finished hands: board, your cards, who won, and every action street by street. */
export function HistorySheet({ code, token, meId, onClose }: { code: string; token: string; meId: string; onClose: () => void }) {
  const { t } = useLang();
  const [hands, setHands] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api
      .history(code, token)
      .then((r) => {
        setHands(r.hands);
        setOpen(r.hands[0]?.handNumber ?? null);
      })
      .catch((e) => setError(errorText(t, e instanceof ApiError ? e.code : undefined)));
  }, [code, token, t]);

  return (
    <Sheet title={t("history")} onClose={onClose}>
      {error && <div className="error-text">{error}</div>}
      {!hands && !error && <div className="muted small">{t("loading")}</div>}
      {hands?.length === 0 && <div className="muted small">{t("noHistory")}</div>}
      <div className="list">
        {hands?.map((h) => (
          <HandRow
            key={h.handNumber}
            item={h}
            meId={meId}
            open={open === h.handNumber}
            onToggle={() => setOpen(open === h.handNumber ? null : h.handNumber)}
          />
        ))}
      </div>
    </Sheet>
  );
}

function HandRow({ item, meId, open, onToggle }: { item: HistoryItem; meId: string; open: boolean; onToggle: () => void }) {
  const { t } = useLang();
  const { fmt } = useChips();
  const h = item.hand;
  const r = h.result!;
  const name = (id: string) => item.names[id] ?? "?";
  const me = h.players.find((p) => p.id === meId);
  const myNet = me ? (r.payouts[meId] ?? 0) - me.committed : null;
  const winners = winnings(h);

  function actionText(e: LogEntry): string {
    if (e.type === "small_blind") return `${t("sbTag")} ${fmt(e.amount ?? 0)}`;
    if (e.type === "big_blind") return `${t("bbTag")} ${fmt(e.amount ?? 0)}`;
    if (e.allIn) return `${t("logAllIn")} ${fmt(e.amount ?? 0)}`;
    const key = ({ check: "logCheck", call: "logCall", fold: "logFold", bet: "logBet", raise: "logRaise" } as const)[e.type];
    return t(key as StringKey, { n: fmt(e.amount ?? 0) }) + (e.type === "call" ? ` ${fmt(e.amount ?? 0)}` : "");
  }

  return (
    <div className="hist">
      <button className="hist-head" onClick={onToggle} aria-expanded={open}>
        <span className="hist-n num">#{item.handNumber}</span>
        <span className="hist-board">
          {h.board.length ? h.board.map((c) => <Card key={c} card={c} size="sm" />) : <span className="muted small">—</span>}
        </span>
        {myNet !== null && (
          <span className={`hist-net num ${myNet > 0 ? "up" : myNet < 0 ? "down" : ""}`}>
            {myNet > 0 ? "+" : ""}
            {fmt(myNet)}
          </span>
        )}
      </button>
      {open && (
        <div className="hist-body">
          {me?.hole && (
            <div className="hist-line">
              <span className="muted small">{t("yourCards")}</span>
              <span className="hist-cards">
                {me.hole.map((c) => (
                  <Card key={c} card={c} size="sm" />
                ))}
              </span>
            </div>
          )}
          {STREETS.map((st) => {
            const acts = h.log.filter((e) => e.street === st);
            if (!acts.length) return null;
            return (
              <div key={st} className="hist-street">
                <div className="hist-street-head">
                  <b>{t(st)}</b>
                  <span className="hist-cards">
                    {h.board.slice(0, BOARD_AT[st]).map((c) => (
                      <Card key={c} card={c} size="sm" />
                    ))}
                  </span>
                </div>
                {acts.map((e, i) => (
                  <div key={i} className="hist-act small">
                    <span className={e.playerId === meId ? "me" : ""}>{name(e.playerId)}</span> {actionText(e)}
                  </div>
                ))}
              </div>
            );
          })}
          {r.showdown && (
            <div className="hist-street">
              <div className="hist-street-head">
                <b>{t("showdownLabel")}</b>
              </div>
              {h.players
                .filter((p) => p.hole && r.hands[p.id])
                .map((p) => (
                  <div key={p.id} className="hist-line">
                    <span className="small">{name(p.id)}</span>
                    <span className="hist-cards">
                      {p.hole!.map((c) => (
                        <Card key={c} card={c} size="sm" />
                      ))}
                    </span>
                    <span className="muted small">{t(r.hands[p.id]!.category)}</span>
                  </div>
                ))}
            </div>
          )}
          {winners.map(([id, amt]) => (
            <div key={id} className="hist-win small">
              {t("wins", { name: name(id), n: fmt(amt) })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
