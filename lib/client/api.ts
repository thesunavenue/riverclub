// Browser-side calls to the room API. The guest token goes only in the Authorization header.
import type { HistoryItem, RoomSettings, RoomView } from "../room";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: string; token?: string | null; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Network error");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } } & T;
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "GENERIC", data.error?.message ?? "Error");
  return data;
}

export interface JoinResponse {
  code?: string;
  token: string;
  playerId: string;
  view: RoomView;
}

export const api = {
  createRoom: (hostName: string, settings?: Partial<RoomSettings>) =>
    call<JoinResponse & { code: string }>("/api/rooms", { method: "POST", body: { hostName, settings } }),
  getRoom: (code: string, token: string | null) => call<{ view: RoomView }>(`/api/rooms/${code}`, { token }),
  join: (code: string, name: string, token: string | null) =>
    call<JoinResponse>(`/api/rooms/${code}/join`, { method: "POST", token, body: { name } }),
  command: (code: string, token: string, body: Record<string, unknown>) =>
    call<{ view: RoomView }>(`/api/rooms/${code}/command`, { method: "POST", token, body }),
  history: (code: string, token: string) => call<{ hands: HistoryItem[] }>(`/api/rooms/${code}/history`, { token }),
  tick: (code: string, token: string | null) =>
    call<{ view: RoomView }>(`/api/rooms/${code}/tick`, { method: "POST", token }),
};

// ---------- device storage (wrapped: storage can be blocked) ----------

const tokenKey = (code: string) => `rivercrew:token:${code}`;

export const storage = {
  getToken(code: string): string | null {
    try {
      return localStorage.getItem(tokenKey(code));
    } catch {
      return null;
    }
  },
  setToken(code: string, token: string) {
    try {
      localStorage.setItem(tokenKey(code), token);
    } catch {}
  },
  clearToken(code: string) {
    try {
      localStorage.removeItem(tokenKey(code));
    } catch {}
  },
  getName(): string {
    try {
      return localStorage.getItem("rivercrew:name") ?? "";
    } catch {
      return "";
    }
  },
  setName(name: string) {
    try {
      localStorage.setItem("rivercrew:name", name);
    } catch {}
  },
};
