/**
 * Server-side entry point for everything a client can ask about a room.
 * Loads the room, resolves the guest token, runs a pure room function and saves
 * with compare-and-swap, retrying when another request saved first.
 */
import type { Action, Card } from "../engine";
import { secureRandomInt, shuffledDeck } from "../engine/random";
import * as rules from "./room";
import { hashToken, newGuestToken, newPlayerId, newRoomCode } from "./secrets";
import type { RoomStore } from "./store";
import { RoomError, type RoomCtx, type RoomSettings, type RoomState } from "./types";
import { historyFor, roomViewFor, type HistoryItem, type RoomView } from "./view";

const MAX_ATTEMPTS = 8;
/** Rooms with no player activity for this long are deleted (chips disappear with the room). */
/** Rooms nobody has touched for this long are deleted. */
export const ROOM_IDLE_MS = 12 * 60 * 60 * 1000;
/** Closed rooms stay a little while so friends still see "table closed", then go. */
export const ROOM_CLOSED_MS = 10 * 60 * 1000;

export interface RoomServiceDeps {
  store: RoomStore;
  now?: () => number;
  newDeck?: () => Card[];
  newId?: () => string;
  newCode?: () => string;
  newToken?: () => string;
  /** Called after every saved change. Realtime should only send {code, version}, never state. */
  onChange?: (code: string, version: number) => void | Promise<void>;
}

export interface JoinResult {
  token: string;
  playerId: string;
  view: RoomView;
}

export class RoomService {
  private store: RoomStore;
  private now: () => number;
  private newDeck: () => Card[];
  private newId: () => string;
  private newCode: () => string;
  private newToken: () => string;
  private onChange?: RoomServiceDeps["onChange"];

  constructor(deps: RoomServiceDeps) {
    this.store = deps.store;
    this.now = deps.now ?? Date.now;
    this.newDeck = deps.newDeck ?? (() => shuffledDeck());
    this.newId = deps.newId ?? newPlayerId;
    this.newCode = deps.newCode ?? newRoomCode;
    this.newToken = deps.newToken ?? newGuestToken;
    this.onChange = deps.onChange;
  }

  private ctx(): RoomCtx {
    return { now: this.now(), newDeck: this.newDeck, newId: this.newId, random: secureRandomInt };
  }

  async createRoom(input: { hostName: string; settings?: Partial<RoomSettings> }): Promise<JoinResult> {
    const token = this.newToken();
    for (let i = 0; i < 5; i++) {
      const ctx = this.ctx();
      const { room, playerId } = rules.createRoom(ctx, {
        code: this.newCode(),
        hostName: input.hostName,
        tokenHash: hashToken(token),
        settings: input.settings,
      });
      if (await this.store.insert(room)) {
        // Housekeeping without a cron job: creating a room clears idle and closed rooms.
        await this.store.deleteInactive(ctx.now - ROOM_IDLE_MS, ctx.now - ROOM_CLOSED_MS).catch(() => 0);
        return { token, playerId, view: roomViewFor(room, playerId, ctx.now) };
      }
    }
    throw new RoomError("CONFLICT", "Could not find a free room code");
  }

  /**
   * Join a room. If `token` belongs to a player here, that player is returned (reconnect).
   * Tokens are always created by the server; an unknown token is ignored.
   */
  async join(code: string, input: { name: string; token?: string | null; autoSit?: boolean }): Promise<JoinResult> {
    const room = await this.load(code);
    const known = input.token ? room.players.find((p) => p.tokenHash === hashToken(input.token!)) : null;
    const token = known ? input.token! : this.newToken();
    const tokenHash = hashToken(token);
    const { playerId, view } = await this.run(code, null, (r, ctx) =>
      rules.join(r, ctx, { name: input.name, tokenHash, autoSit: input.autoSit }),
    );
    return { token, playerId: playerId!, view };
  }

  /** Read-only. Spectators (no token) see the table without anyone's hole cards. */
  async view(code: string, token: string | null): Promise<RoomView> {
    const room = await this.load(code);
    const pid = token ? this.resolve(room, token) : null;
    return roomViewFor(room, pid, this.now());
  }

  /** Past hands, for players in the room only. */
  async history(code: string, token: string): Promise<HistoryItem[]> {
    const room = await this.load(code);
    return historyFor(room, this.resolve(room, token));
  }

  setAvatar(code: string, token: string, avatar: string) {
    return this.mutate(code, token, (r, ctx, me) => rules.setAvatar(r, ctx, me, avatar));
  }
  sit(code: string, token: string, seat: number) {
    return this.mutate(code, token, (r, ctx, me) => rules.sit(r, ctx, me, seat));
  }
  stand(code: string, token: string) {
    return this.mutate(code, token, (r, ctx, me) => rules.stand(r, ctx, me));
  }
  setAway(code: string, token: string, targetId: string, away: boolean) {
    return this.mutate(code, token, (r, ctx, me) => rules.setAway(r, ctx, me, targetId, away));
  }
  startGame(code: string, token: string) {
    return this.mutate(code, token, (r, ctx, me) => rules.startGame(r, ctx, me));
  }
  setPaused(code: string, token: string, paused: boolean) {
    return this.mutate(code, token, (r, ctx, me) => rules.setPaused(r, ctx, me, paused));
  }
  kick(code: string, token: string, targetId: string) {
    return this.mutate(code, token, (r, ctx, me) => rules.kick(r, ctx, me, targetId));
  }
  transferHost(code: string, token: string, targetId: string) {
    return this.mutate(code, token, (r, ctx, me) => rules.transferHost(r, ctx, me, targetId));
  }
  playAgain(code: string, token: string) {
    return this.mutate(code, token, (r, ctx, me) => rules.playAgain(r, ctx, me));
  }
  closeRoom(code: string, token: string) {
    return this.mutate(code, token, (r, ctx, me) => rules.closeRoom(r, ctx, me));
  }
  showCards(code: string, token: string, which: unknown) {
    return this.mutate(code, token, (r, ctx, me) => rules.showCards(r, ctx, me, which));
  }
  sendChat(code: string, token: string, text: string) {
    return this.mutate(code, token, (r, ctx, me) => rules.sendChat(r, ctx, me, text));
  }
  act(code: string, token: string, action: Action, actionId: string) {
    return this.mutate(code, token, (r, ctx, me) => rules.act(r, ctx, me, action, actionId));
  }

  /** Any client in the room may call this; the server decides from its own clock. */
  async tick(code: string, token: string | null): Promise<RoomView> {
    const { view } = await this.run(code, token, (r, ctx) => ({ room: rules.tick(r, ctx), playerId: null }));
    return view;
  }

  // ---------- internals ----------

  private async load(code: string): Promise<RoomState> {
    const room = await this.store.get(code);
    if (!room) throw new RoomError("NOT_FOUND", "Room not found");
    return room;
  }

  private resolve(room: RoomState, token: string): string {
    const p = room.players.find((x) => x.tokenHash === hashToken(token));
    if (!p) throw new RoomError("UNAUTHORIZED", "Unknown player token");
    if (p.banned) throw new RoomError("BANNED", "You were removed from this room");
    return p.id;
  }

  private async mutate(
    code: string,
    token: string,
    fn: (room: RoomState, ctx: RoomCtx, me: string) => RoomState,
  ): Promise<RoomView> {
    const { view } = await this.run(code, token, (r, ctx, me) => ({ room: fn(r, ctx, me!), playerId: me }));
    return view;
  }

  /** Load, apply, compare-and-swap save; retry if someone else saved first. */
  private async run(
    code: string,
    token: string | null,
    fn: (room: RoomState, ctx: RoomCtx, me: string | null) => { room: RoomState; playerId: string | null },
  ): Promise<{ playerId: string | null; view: RoomView }> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const room = await this.load(code);
      const me = token ? this.resolve(room, token) : null;
      const ctx = this.ctx();
      const { room: next, playerId } = fn(room, ctx, me);
      const viewer = playerId ?? me;
      if (next === room || JSON.stringify(next) === JSON.stringify(room)) {
        return { playerId, view: roomViewFor(room, viewer, ctx.now) };
      }
      next.version = room.version + 1;
      if (await this.store.update(next, room.version)) {
        await this.onChange?.(code, next.version);
        return { playerId, view: roomViewFor(next, viewer, ctx.now) };
      }
    }
    throw new RoomError("CONFLICT", "Room is busy, please retry");
  }
}
