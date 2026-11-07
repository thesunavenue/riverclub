/**
 * Room rules as pure functions: (room, ctx, ...args) => new room.
 * No database, no clock, no randomness: those come in through `ctx`.
 * Every function returns a new object and never mutates its input.
 */
import {
  applyAction,
  MAX_SEATS,
  nextButtonSeat,
  startHand,
  timeoutAction,
  type Action,
  type HandState,
} from "../engine";
import {
  AVATARS,
  CHAT_INTERVAL_MS,
  HISTORY_HANDS,
  MAX_MISSED_TURNS,
  DEFAULT_SETTINGS,
  HAND_PAUSE_MS,
  RUNOUT_STREET_MS,
  MAX_CHAT_LENGTH,
  MAX_CHAT_MESSAGES,
  MAX_NAME_LENGTH,
  MAX_ROOM_PLAYERS,
  RECENT_ACTION_IDS,
  RoomError,
  type RoomCtx,
  type RoomPlayer,
  type RoomSettings,
  type RoomState,
} from "./types";

const isInt = (n: unknown, min: number, max: number): n is number =>
  Number.isInteger(n) && (n as number) >= min && (n as number) <= max;

export function validateSettings(input: Partial<RoomSettings> = {}): RoomSettings {
  const s: RoomSettings = {
    startingStack: input.startingStack ?? DEFAULT_SETTINGS.startingStack,
    smallBlind: input.smallBlind ?? DEFAULT_SETTINGS.smallBlind,
    bigBlind: input.bigBlind ?? DEFAULT_SETTINGS.bigBlind,
    turnSeconds: input.turnSeconds ?? DEFAULT_SETTINGS.turnSeconds,
  };
  if (!isInt(s.startingStack, 100, 1_000_000))
    throw new RoomError("INVALID", "Starting chips must be 100 to 1,000,000");
  if (!isInt(s.bigBlind, 2, Math.floor(s.startingStack / 2)))
    throw new RoomError("INVALID", "Big blind must be at least 2 and at most half the starting chips");
  if (!isInt(s.smallBlind, 1, s.bigBlind))
    throw new RoomError("INVALID", "Small blind must be between 1 and the big blind");
  if (!isInt(s.turnSeconds, 10, 120))
    throw new RoomError("INVALID", "Turn time must be 10 to 120 seconds");
  return s;
}

export function validateName(name: unknown): string {
  if (typeof name !== "string") throw new RoomError("INVALID", "Name required");
  // Drop control characters, collapse spaces.
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (clean.length < 1 || clean.length > MAX_NAME_LENGTH)
    throw new RoomError("INVALID", `Name must be 1 to ${MAX_NAME_LENGTH} characters`);
  return clean;
}

function player(r: RoomState, id: string): RoomPlayer {
  const p = r.players.find((x) => x.id === id && !x.banned);
  if (!p) throw new RoomError("UNAUTHORIZED", "Not in this room");
  return p;
}

function requireHost(r: RoomState, id: string): void {
  player(r, id);
  if (r.hostId !== id) throw new RoomError("FORBIDDEN", "Only the host can do this");
}

/** The hand being played right now (not a finished one kept for display). */
export function activeHand(r: RoomState): HandState | null {
  return r.hand && r.hand.street !== "complete" ? r.hand : null;
}

function inActiveHand(r: RoomState, id: string): boolean {
  return !!activeHand(r)?.players.some((p) => p.id === id);
}

function eligibleForHand(r: RoomState): RoomPlayer[] {
  return r.players.filter((p) => p.seat !== null && p.stack > 0 && !p.away && !p.leaving && !p.banned);
}

function begin(room: RoomState, ctx: RoomCtx): RoomState {
  if (room.status === "closed") throw new RoomError("CLOSED", "This table is closed");
  const r = structuredClone(room);
  r.lastActivityAt = ctx.now;
  return r;
}

/**
 * Bring the room to a stable point: auto-act for players who are away or leaving,
 * pay out finished hands, start the next hand when it is time, and set the turn timer.
 */
const STREET_ORDER = ["preflop", "flop", "turn", "river"];

/** Board streets dealt after the last betting action (an all-in run-out). */
export function runoutStreets(hand: HandState): number {
  const last = [...hand.log].reverse().find((e) => e.type !== "small_blind" && e.type !== "big_blind");
  const lastIdx = STREET_ORDER.indexOf(last?.street ?? "preflop");
  const boardIdx = hand.board.length >= 5 ? 3 : hand.board.length === 4 ? 2 : hand.board.length === 3 ? 1 : 0;
  return Math.max(0, boardIdx - lastIdx);
}

function settle(r: RoomState, ctx: RoomCtx): RoomState {
  for (let guard = 0; guard < 1000; guard++) {
    const hand = activeHand(r);
    if (hand) {
      const cur = hand.players[hand.toAct!]!;
      const rp = r.players.find((p) => p.id === cur.id)!;
      if (rp.leaving || rp.banned) {
        r.hand = applyAction(hand, cur.id, { type: "fold" });
        continue;
      }
      if (rp.away) {
        r.hand = applyAction(hand, cur.id, timeoutAction(hand)!);
        continue;
      }
      const key = `${hand.handNumber}:${hand.log.length}`;
      if (r.turnKey !== key) {
        r.turnKey = key;
        r.turnDeadline = ctx.now + r.settings.turnSeconds * 1000;
      }
      return r;
    }

    r.turnKey = null;
    r.turnDeadline = null;

    if (r.hand && r.hand.street === "complete" && (r.settledHand ?? 0) !== r.hand.handNumber) {
      // A hand just finished: write the chips back, record who busted, free seats of leavers.
      r.settledHand = r.hand.handNumber;
      const names: Record<string, string> = {};
      for (const p of r.players) names[p.id] = p.name;
      r.history = [...(r.history ?? []), { hand: { ...r.hand, deck: [] }, names, endedAt: ctx.now }].slice(
        -HISTORY_HANDS,
      );
      for (const hp of r.hand.players) {
        const rp = r.players.find((p) => p.id === hp.id)!;
        rp.stack = hp.stack;
        if (hp.stack === 0)
          r.eliminated = [...(r.eliminated ?? []), { playerId: rp.id, name: rp.name, handNumber: r.hand.handNumber }];
      }
      for (const p of r.players) {
        if (p.leaving) {
          p.seat = null;
          p.leaving = false;
        }
      }
      r.nextHandAt = ctx.now + HAND_PAUSE_MS + runoutStreets(r.hand) * RUNOUT_STREET_MS;
      // Out of chips means out of the game. One player left with chips: game over.
      const alive = r.players.filter((p) => p.seat !== null && p.stack > 0 && !p.banned);
      if (r.status === "playing" && alive.length <= 1) {
        r.status = "finished";
        r.winnerId = alive[0]?.id ?? null;
        r.nextHandAt = null;
      }
    }

    if (r.status !== "playing" || r.paused) return r;
    if (r.nextHandAt !== null && ctx.now < r.nextHandAt) return r;
    const eligible = eligibleForHand(r);
    if (eligible.length < 2) return r;

    r.buttonSeat = nextButtonSeat(
      eligible.map((p) => p.seat!),
      r.buttonSeat,
    );
    r.handCount += 1;
    r.shows = undefined;
    r.hand = startHand({
      handNumber: r.handCount,
      players: eligible.map((p) => ({ id: p.id, seat: p.seat!, stack: p.stack })),
      buttonSeat: r.buttonSeat,
      smallBlind: r.settings.smallBlind,
      bigBlind: r.settings.bigBlind,
      deck: ctx.newDeck(),
    });
    r.nextHandAt = null;
  }
  throw new Error("settle did not converge");
}

// ---------- Room lifecycle ----------

export function createRoom(
  ctx: RoomCtx,
  input: { code: string; hostName: string; tokenHash: string; settings?: Partial<RoomSettings> },
): { room: RoomState; playerId: string } {
  const settings = validateSettings(input.settings);
  const name = validateName(input.hostName);
  const id = ctx.newId();
  const room: RoomState = {
    code: input.code,
    version: 1,
    createdAt: ctx.now,
    lastActivityAt: ctx.now,
    settings,
    hostId: id,
    status: "waiting",
    paused: false,
    players: [{ ...newPlayer(id, name, input.tokenHash, settings.startingStack), avatar: pickAvatar([], ctx) }],
    hand: null,
    handCount: 0,
    buttonSeat: null,
    turnDeadline: null,
    turnKey: null,
    nextHandAt: null,
    recentActionIds: [],
    chipsIssued: settings.startingStack,
  };
  return { room, playerId: id };
}

/** A random avatar nobody in the room has yet (if possible). */
function pickAvatar(players: RoomPlayer[], ctx: RoomCtx): string {
  const used = new Set(players.map((p) => p.avatar));
  const free = AVATARS.filter((a) => !used.has(a));
  const pool = free.length ? free : [...AVATARS];
  const i = ctx.random ? ctx.random(pool.length) : players.length % pool.length;
  return pool[i]!;
}

/** Pick your own avatar from the list. */
export function setAvatar(room: RoomState, ctx: RoomCtx, playerId: string, avatar: unknown): RoomState {
  if (typeof avatar !== "string" || !(AVATARS as readonly string[]).includes(avatar))
    throw new RoomError("INVALID", "Unknown avatar");
  const r = begin(room, ctx);
  player(r, playerId).avatar = avatar;
  return r;
}

function newPlayer(id: string, name: string, tokenHash: string, stack: number): RoomPlayer {
  return {
    id,
    name,
    tokenHash,
    seat: null,
    stack,
    away: false,
    leaving: false,
    banned: false,
  };
}

/** Join with a guest token. The same token gets the same player back (reconnect). */
export function join(
  room: RoomState,
  ctx: RoomCtx,
  input: { name: string; tokenHash: string; autoSit?: boolean },
): { room: RoomState; playerId: string } {
  const existing = room.players.find((p) => p.tokenHash === input.tokenHash);
  if (existing) {
    if (existing.banned) throw new RoomError("BANNED", "You were removed from this room");
    return { room, playerId: existing.id };
  }
  const r = begin(room, ctx);
  const name = validateName(input.name);
  const members = r.players.filter((p) => !p.banned);
  if (members.length >= MAX_ROOM_PLAYERS) throw new RoomError("ROOM_FULL", "Room is full");
  if (members.some((p) => p.name.toLowerCase() === name.toLowerCase()))
    throw new RoomError("NAME_TAKEN", "Someone already uses this name");
  const id = ctx.newId();
  r.players.push({ ...newPlayer(id, name, input.tokenHash, r.settings.startingStack), avatar: pickAvatar(r.players, ctx) });
  r.chipsIssued += r.settings.startingStack;
  if (!input.autoSit || r.status === "finished") return { room: r, playerId: id };
  const seat = freeSeat(r);
  if (seat === null) return { room: r, playerId: id }; // table full: watch until a seat frees
  r.players.at(-1)!.seat = seat;
  return { room: settle(r, ctx), playerId: id };
}

/** Seats filled in an order that spreads players around the table. */
const SEAT_ORDER = [0, 4, 2, 6, 1, 5, 3, 7, 8].filter((s) => s < MAX_SEATS);

function freeSeat(r: RoomState): number | null {
  const taken = new Set(r.players.map((p) => p.seat));
  return SEAT_ORDER.find((s) => !taken.has(s)) ?? null;
}

// ---------- Seats ----------

export function sit(room: RoomState, ctx: RoomCtx, playerId: string, seat: number): RoomState {
  const r = begin(room, ctx);
  const p = player(r, playerId);
  if (p.seat !== null) throw new RoomError("INVALID", "Already seated");
  if (!isInt(seat, 0, MAX_SEATS - 1)) throw new RoomError("INVALID", "No such seat");
  if (r.players.some((x) => x.seat === seat)) throw new RoomError("SEAT_TAKEN", "Seat is taken");
  p.seat = seat;
  p.away = false;
  return settle(r, ctx);
}

/** Leave the seat. During a hand the player folds and the seat frees when the hand ends. */
export function stand(room: RoomState, ctx: RoomCtx, playerId: string): RoomState {
  const r = begin(room, ctx);
  const p = player(r, playerId);
  if (p.seat === null) throw new RoomError("INVALID", "Not seated");
  if (inActiveHand(r, p.id)) p.leaving = true;
  else p.seat = null;
  return settle(r, ctx);
}

/** Sit out or come back. A player can set it for themself; the host can set it for anyone. */
export function setAway(
  room: RoomState,
  ctx: RoomCtx,
  actorId: string,
  targetId: string,
  away: boolean,
): RoomState {
  const r = begin(room, ctx);
  player(r, actorId);
  if (actorId !== targetId) requireHost(r, actorId);
  const t = player(r, targetId);
  t.away = away;
  t.missedTurns = 0;
  return settle(r, ctx);
}

// ---------- Host controls ----------

export function startGame(room: RoomState, ctx: RoomCtx, hostId: string): RoomState {
  const r = begin(room, ctx);
  requireHost(r, hostId);
  if (r.status !== "waiting") throw new RoomError("INVALID", "Game already started");
  if (eligibleForHand(r).length < 2)
    throw new RoomError("NOT_ENOUGH_PLAYERS", "Need at least 2 seated players with chips");
  r.status = "playing";
  r.paused = false;
  return settle(r, ctx);
}

/** Pause: the current hand is played out, then no new hand starts until resumed. */
export function setPaused(room: RoomState, ctx: RoomCtx, hostId: string, paused: boolean): RoomState {
  const r = begin(room, ctx);
  requireHost(r, hostId);
  r.paused = paused;
  return settle(r, ctx);
}

export function kick(room: RoomState, ctx: RoomCtx, hostId: string, targetId: string): RoomState {
  const r = begin(room, ctx);
  requireHost(r, hostId);
  if (targetId === hostId) throw new RoomError("INVALID", "Transfer host before leaving");
  const t = player(r, targetId);
  t.banned = true;
  if (inActiveHand(r, t.id)) t.leaving = true;
  else t.seat = null;
  return settle(r, ctx);
}

export function transferHost(room: RoomState, ctx: RoomCtx, hostId: string, targetId: string): RoomState {
  const r = begin(room, ctx);
  requireHost(r, hostId);
  r.hostId = player(r, targetId).id;
  return r;
}

// ---------- End of game ----------

/** Host starts a fresh game: everyone gets the starting chips again. */
export function playAgain(room: RoomState, ctx: RoomCtx, hostId: string): RoomState {
  const r = begin(room, ctx);
  requireHost(r, hostId);
  if (r.status !== "finished") throw new RoomError("INVALID", "The game is not over yet");
  for (const p of r.players) p.stack = p.banned ? 0 : r.settings.startingStack;
  r.chipsIssued = r.players.reduce((sum, p) => sum + p.stack, 0);
  r.eliminated = [];
  r.winnerId = null;
  r.paused = false;
  r.nextHandAt = null;
  if (eligibleForHand(r).length < 2)
    throw new RoomError("NOT_ENOUGH_PLAYERS", "Need at least 2 seated players with chips");
  r.status = "playing";
  return settle(r, ctx);
}

/** Host closes the table for good. Everyone sees a "closed" screen; nothing can change any more. */
export function closeRoom(room: RoomState, ctx: RoomCtx, hostId: string): RoomState {
  const r = begin(room, ctx);
  requireHost(r, hostId);
  r.status = "closed";
  r.turnDeadline = null;
  r.turnKey = null;
  r.nextHandAt = null;
  // Nothing in a closed room is needed again: keep only what the "table closed" screen shows.
  r.hand = null;
  r.history = [];
  r.chat = [];
  return r;
}

// ---------- Showing cards for fun ----------

/**
 * Show one or both hole cards after folding, or after the hand ended without a showdown for you.
 * Others see them only once the hand is complete, so showing never changes how a hand is played.
 */
export function showCards(room: RoomState, ctx: RoomCtx, playerId: string, which: unknown): RoomState {
  const r = begin(room, ctx);
  player(r, playerId);
  const hand = r.hand;
  const hp = hand?.players.find((p) => p.id === playerId);
  if (!hand || !hp) throw new RoomError("INVALID", "You are not in this hand");
  if (hand.street !== "complete" && !hp.folded) throw new RoomError("INVALID", "Fold or finish the hand first");
  if (hand.result?.hands[playerId]) throw new RoomError("INVALID", "Already shown at showdown");
  if (!Array.isArray(which) || which.length === 0 || which.length > 2 || !which.every((i) => i === 0 || i === 1))
    throw new RoomError("INVALID", "Choose card 0, 1 or both");
  if (!r.shows || r.shows.hand !== hand.handNumber) r.shows = { hand: hand.handNumber, cards: {} };
  const cur = r.shows.cards[playerId] ?? [false, false];
  r.shows.cards[playerId] = [cur[0] || which.includes(0), cur[1] || which.includes(1)];
  return r;
}

// ---------- Chat ----------

/** Short text chat (emoji are just text). Rate-limited per player. */
export function sendChat(room: RoomState, ctx: RoomCtx, playerId: string, text: unknown): RoomState {
  if (typeof text !== "string") throw new RoomError("INVALID", "Message required");
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length < 1 || clean.length > MAX_CHAT_LENGTH)
    throw new RoomError("INVALID", `Message must be 1 to ${MAX_CHAT_LENGTH} characters`);
  const r = begin(room, ctx);
  const p = player(r, playerId);
  if (p.lastChatAt !== undefined && ctx.now - p.lastChatAt < CHAT_INTERVAL_MS)
    throw new RoomError("RATE_LIMITED", "Slow down a little");
  p.lastChatAt = ctx.now;
  r.chat = [...(r.chat ?? []), { id: ctx.newId(), playerId, name: p.name, text: clean, at: ctx.now }].slice(
    -MAX_CHAT_MESSAGES,
  );
  return r;
}

// ---------- Playing ----------

/**
 * Apply a betting action. `actionId` is chosen by the client once per decision;
 * sending the same id again is a no-op (safe retries).
 */
export function act(
  room: RoomState,
  ctx: RoomCtx,
  playerId: string,
  action: Action,
  actionId: string,
): RoomState {
  if (typeof actionId !== "string" || actionId.length < 1 || actionId.length > 64)
    throw new RoomError("INVALID", "actionId required");
  if (room.recentActionIds.includes(actionId)) return room;
  const r = begin(room, ctx);
  player(r, playerId);
  const hand = activeHand(r);
  if (!hand) throw new RoomError("NO_HAND", "No hand in progress");
  r.hand = applyAction(hand, playerId, action); // throws EngineError if illegal
  player(r, playerId).missedTurns = 0;
  r.recentActionIds = [...r.recentActionIds, actionId].slice(-RECENT_ACTION_IDS);
  return settle(r, ctx);
}

/**
 * Housekeeping any client may trigger: handles an expired turn timer and starts
 * the next hand when the pause between hands is over. The server checks the times itself.
 */
export function tick(room: RoomState, ctx: RoomCtx): RoomState {
  if (room.status === "closed") return room;
  const r = structuredClone(room);
  const hand = activeHand(r);
  if (hand && r.turnDeadline !== null && ctx.now >= r.turnDeadline) {
    const id = hand.players[hand.toAct!]!.id;
    r.hand = applyAction(hand, id, timeoutAction(hand)!);
    // Nobody home? After a few missed turns, sit them out so the table doesn't play by itself.
    const p = r.players.find((x) => x.id === id)!;
    p.missedTurns = (p.missedTurns ?? 0) + 1;
    if (p.missedTurns >= MAX_MISSED_TURNS) {
      p.away = true;
      p.missedTurns = 0;
    }
  }
  return settle(r, ctx);
}

/** Chips in the room right now: stacks plus chips in the pot. Must equal `chipsIssued`. */
export function roomChipTotal(r: RoomState): number {
  const hand = activeHand(r);
  const inHand = new Set(hand?.players.map((p) => p.id) ?? []);
  let total = 0;
  for (const p of r.players) if (!inHand.has(p.id)) total += p.stack;
  for (const p of hand?.players ?? []) total += p.stack + p.committed;
  return total;
}
