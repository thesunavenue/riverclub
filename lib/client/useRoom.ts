"use client";
/**
 * Keeps one client's view of a room fresh:
 * - Supabase Realtime tells us "version N exists" (no state over the channel), then we fetch our own view.
 * - Polling is the fallback (fast without realtime, slow with it).
 * - When the turn timer or the pause between hands runs out, we ask the server to `tick`;
 *   the server checks its own clock, so any client may ask.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Action } from "../engine";
import type { RoomView } from "../room";
import { ApiError, api, storage } from "./api";

export type RoomStatus = "loading" | "ready" | "notFound" | "banned";

/** One browser client for Realtime only (no auth, no database access: RLS blocks the tables). */
let rtClient: SupabaseClient | null | undefined;
function realtimeClient(): SupabaseClient | null {
  if (rtClient !== undefined) return rtClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  rtClient =
    url && key
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      : null;
  return rtClient;
}

function newActionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useRoom(code: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<RoomStatus>("loading");
  const [offline, setOffline] = useState(false);
  const [live, setLive] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tickNonce, setTickNonce] = useState(0);

  const viewRef = useRef<RoomView | null>(null);
  const tokenRef = useRef<string | null>(null);
  const offsetRef = useRef(0);

  const accept = useCallback((v: RoomView) => {
    const cur = viewRef.current;
    if (cur && v.version < cur.version) return; // an older response arrived late
    offsetRef.current = v.serverNow - Date.now();
    viewRef.current = v;
    setView(v);
    setStatus("ready");
    setOffline(false);
  }, []);

  const forgetToken = useCallback(() => {
    storage.clearToken(code);
    tokenRef.current = null;
    setToken(null);
  }, [code]);

  const handleError = useCallback(
    (e: unknown) => {
      if (!(e instanceof ApiError)) return;
      if (e.code === "NETWORK" || e.status >= 500) setOffline(true);
      else if (e.code === "NOT_FOUND") setStatus("notFound");
      else if (e.code === "BANNED") {
        forgetToken();
        setStatus("banned");
      } else if (e.code === "UNAUTHORIZED") forgetToken(); // token no longer valid: watch as spectator
    },
    [forgetToken],
  );

  const refresh = useCallback(async () => {
    try {
      accept((await api.getRoom(code, tokenRef.current)).view);
    } catch (e) {
      handleError(e);
    }
  }, [code, accept, handleError]);

  // Load the saved token for this room, then the view.
  useEffect(() => {
    const saved = storage.getToken(code);
    tokenRef.current = saved;
    setToken(saved);
    void refresh();
  }, [code, refresh]);

  // Nothing left to follow: stop all network activity (no polling a deleted or closed room all night).
  const gone = status === "notFound" || status === "banned" || view?.status === "closed";

  // Realtime: only {code, version} arrives; we then fetch our private view.
  useEffect(() => {
    if (gone) return;
    const sb = realtimeClient();
    if (!sb) return;
    const channel = sb
      .channel(`room:${code}`)
      .on("broadcast", { event: "version" }, ({ payload }) => {
        const v = (payload as { version?: number } | undefined)?.version ?? 0;
        if (v > (viewRef.current?.version ?? 0)) void refresh();
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => {
      setLive(false);
      void sb.removeChannel(channel);
    };
  }, [code, refresh, gone]);

  // Polling fallback, and catch up when the tab comes back.
  useEffect(() => {
    if (gone) return;
    const ms = live ? 30_000 : 2_500;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, ms);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [live, refresh, gone]);

  // Ask the server to handle an expired turn or start the next hand.
  const version = view?.version;
  const turnDeadline = view?.turnDeadline ?? null;
  const nextHandAt = view?.nextHandAt ?? null;
  const paused = view?.paused ?? false;
  useEffect(() => {
    const target = turnDeadline ?? (paused ? null : nextHandAt);
    if (target === null) return;
    // Small random spread so not every client calls at the same moment.
    const delay = Math.max(0, target - (Date.now() + offsetRef.current)) + 250 + Math.random() * 600;
    const id = setTimeout(async () => {
      try {
        const before = viewRef.current?.version;
        const res = await api.tick(code, tokenRef.current);
        accept(res.view);
        if (res.view.version === before) setTimeout(() => setTickNonce((n) => n + 1), 1000);
      } catch (e) {
        handleError(e);
        setTimeout(() => setTickNonce((n) => n + 1), 2000);
      }
    }, delay);
    return () => clearTimeout(id);
  }, [code, version, turnDeadline, nextHandAt, paused, tickNonce, accept, handleError]);

  const command = useCallback(
    async (body: Record<string, unknown>) => {
      const t = tokenRef.current;
      if (!t) throw new ApiError(401, "UNAUTHORIZED", "Join first");
      try {
        accept((await api.command(code, t, body)).view);
      } catch (e) {
        handleError(e);
        throw e;
      }
    },
    [code, accept, handleError],
  );

  /** Betting action with an id, retried once on a network error (the server ignores duplicates). */
  const act = useCallback(
    async (action: Action) => {
      const body = { cmd: "act", action, actionId: newActionId() };
      try {
        await command(body);
      } catch (e) {
        if (e instanceof ApiError && e.code === "NETWORK") await command(body);
        else throw e;
      }
    },
    [command],
  );

  const join = useCallback(
    async (name: string) => {
      const res = await api.join(code, name, tokenRef.current);
      storage.setToken(code, res.token);
      storage.setName(name);
      tokenRef.current = res.token;
      setToken(res.token);
      accept(res.view);
    },
    [code, accept],
  );

  /** Server time estimate, for countdowns. */
  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { view, status, offline, live, token, refresh, command, act, join, serverNow };
}
