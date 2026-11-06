import { viewFor, type HandView } from "../engine";
import { activeHand } from "./room";
import type { ChatMessage, RoomSettings, RoomState } from "./types";

export interface RoomPlayerView {
  id: string;
  name: string;
  avatar: string;
  seat: number | null;
  stack: number;
  away: boolean;
  leaving: boolean;
  /** Ran out of chips this game. */
  out: boolean;
  isHost: boolean;
  inHand: boolean;
}

/** What one client receives. Built field by field: no token hashes, no hidden cards, no deck. */
export interface RoomView {
  code: string;
  version: number;
  status: RoomState["status"];
  paused: boolean;
  settings: RoomSettings;
  hostId: string;
  handCount: number;
  /** Server clock, so clients can show the turn timer correctly. */
  serverNow: number;
  turnDeadline: number | null;
  nextHandAt: number | null;
  me: RoomPlayerView | null;
  players: RoomPlayerView[];
  hand: HandView | null;
  chat: ChatMessage[];
  /** Set when status is "finished": winner first, then the others by when they busted (last out first). */
  standings: { playerId: string; name: string; place: number }[];
}

export function roomViewFor(r: RoomState, viewerId: string | null, now: number): RoomView {
  const hand = activeHand(r);
  const live = new Map(hand?.players.map((p) => [p.id, p]) ?? []);
  const players: RoomPlayerView[] = r.players
    // Removed players disappear once they leave their seat.
    .filter((p) => !p.banned || p.seat !== null)
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar ?? "🙂",
      seat: p.seat,
      stack: live.get(p.id)?.stack ?? p.stack,
      away: p.away,
      leaving: p.leaving,
      out: p.seat !== null && p.stack === 0 && !live.has(p.id) && (r.status === "playing" || r.status === "finished"),
      isHost: p.id === r.hostId,
      inHand: live.has(p.id),
    }));
  const viewer = r.players.find((p) => p.id === viewerId && !p.banned);
  return {
    code: r.code,
    version: r.version,
    status: r.status,
    paused: r.paused,
    settings: { ...r.settings },
    hostId: r.hostId,
    handCount: r.handCount,
    serverNow: now,
    turnDeadline: r.turnDeadline,
    nextHandAt: r.nextHandAt,
    me: viewer ? players.find((p) => p.id === viewer.id) ?? null : null,
    players,
    hand: r.hand ? viewFor(r.hand, viewer ? viewer.id : null) : null,
    chat: (r.chat ?? []).map((m) => ({ ...m })),
    standings: r.status === "finished" ? standings(r) : [],
  };
}

function standings(r: RoomState): RoomView["standings"] {
  const out: RoomView["standings"] = [];
  const winner = r.players.find((p) => p.id === r.winnerId);
  if (winner) out.push({ playerId: winner.id, name: winner.name, place: 1 });
  // Busted in the same hand = same place.
  const elim = [...(r.eliminated ?? [])].reverse();
  let place = out.length;
  let lastHand = -1;
  for (const e of elim) {
    if (out.some((o) => o.playerId === e.playerId)) continue;
    if (e.handNumber !== lastHand) place = out.length + 1;
    lastHand = e.handNumber;
    out.push({ playerId: e.playerId, name: e.name, place });
  }
  return out;
}

export interface HistoryItem {
  handNumber: number;
  endedAt: number;
  names: Record<string, string>;
  /** Same filtering as the live table: your own cards, and cards shown at showdown. Nothing else. */
  hand: HandView;
}

/** Past hands for one viewer, newest first. */
export function historyFor(r: RoomState, viewerId: string): HistoryItem[] {
  return [...(r.history ?? [])].reverse().map((h) => ({
    handNumber: h.hand.handNumber,
    endedAt: h.endedAt,
    names: { ...h.names },
    hand: viewFor(h.hand, viewerId),
  }));
}
