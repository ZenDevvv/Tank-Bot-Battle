import type { AuthUser, BotRecord, MapRecord, MatchRecord, ReplayRecord } from "../types";

function resolveApiBase(): string {
  const override = (globalThis as typeof globalThis & { __API_BASE__?: string }).__API_BASE__;
  if (override) {
    return override;
  }

  try {
    return (new Function("return import.meta.env?.VITE_API_URL ?? 'http://localhost:4000';") as () => string)();
  } catch {
    return "http://localhost:4000";
  }
}

const API_BASE = resolveApiBase();

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(payload.message ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  register(payload: { username: string; email: string; password: string }) {
    return request<{ token: string; user: AuthUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  login(payload: { email: string; password: string }) {
    return request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  me(token: string) {
    return request<AuthUser>("/auth/me", undefined, token);
  },
  getSchemaExample() {
    return request<Record<string, unknown>>("/schema/bot/example");
  },
  validateBot(payload: unknown) {
    return request<{ valid: true; definition: unknown }>("/bots/validate", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  listMaps() {
    return request<MapRecord[]>("/maps");
  },
  listBots(token: string) {
    return request<BotRecord[]>("/bots", undefined, token);
  },
  createBot(token: string, payload: unknown) {
    return request<BotRecord>("/bots", {
      method: "POST",
      body: JSON.stringify(payload)
    }, token);
  },
  deleteBot(token: string, id: string) {
    return request<void>(`/bots/${id}`, {
      method: "DELETE"
    }, token);
  },
  createMatch(token: string, payload: { leftBotId: string; rightBotId: string; mapId: string }) {
    return request<{ id: string; winnerTankId: string | null; reason: string; totalTicks: number; replayLength: number }>("/matches", {
      method: "POST",
      body: JSON.stringify(payload)
    }, token);
  },
  listMatches(token: string) {
    return request<MatchRecord[]>("/matches", undefined, token);
  },
  getReplay(token: string, id: string) {
    return request<ReplayRecord>(`/matches/${id}/replay`, undefined, token);
  }
};
