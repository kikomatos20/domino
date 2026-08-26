"use client";

import type { PlayerView } from "@/server/types";

/**
 * Browser side of the multiplayer API.
 *
 * The player's token is their identity — no login, so it is kept in
 * localStorage per room and sent as a header. Losing it means losing the seat,
 * which is why rejoining from the same browser works and from another does not.
 */

const tokenKey = (code: string) => `domino:token:${code.toUpperCase()}`;
const NICK_KEY = "domino:nickname";

export function savedToken(code: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(tokenKey(code));
}

export function saveToken(code: string, token: string) {
  window.localStorage.setItem(tokenKey(code), token);
}

export function savedNickname(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NICK_KEY) ?? "";
}

export function saveNickname(name: string) {
  window.localStorage.setItem(NICK_KEY, name);
}

async function parse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? "Something went wrong");
  return body;
}

/**
 * Add the account session, if there is one.
 *
 * Only sent when taking a seat — it decides whether results get written down,
 * not whether the game works. Play as a guest and everything is identical
 * except that nothing is kept.
 */
async function withSession(headers: Record<string, string>): Promise<Record<string, string>> {
  try {
    const { accessToken } = await import("./auth");
    const token = await accessToken();
    return token ? { ...headers, authorization: `Bearer ${token}` } : headers;
  } catch {
    return headers;
  }
}

export async function createRoom(opts: {
  nickname: string;
  fillWithAi: boolean;
  difficulty: string;
}): Promise<{ code: string; token: string; view: PlayerView }> {
  const body = await parse(
    await fetch("/api/rooms", {
      method: "POST",
      headers: await withSession({ "content-type": "application/json" }),
      body: JSON.stringify(opts),
    })
  );
  saveToken(body.view.code, body.token);
  return { code: body.view.code, token: body.token, view: body.view };
}

export async function joinRoom(
  code: string,
  nickname: string
): Promise<{ token: string; view: PlayerView }> {
  const body = await parse(
    await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      headers: await withSession({ "content-type": "application/json" }),
      body: JSON.stringify({ nickname }),
    })
  );
  saveToken(code, body.token);
  return body;
}

export async function fetchView(code: string): Promise<PlayerView> {
  const token = savedToken(code);
  const body = await parse(
    await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
      headers: token ? { "x-player-token": token } : {},
      cache: "no-store",
    })
  );
  return body.view;
}

export async function act(
  code: string,
  payload: Record<string, unknown>
): Promise<PlayerView | null> {
  const token = savedToken(code);
  if (!token) throw new Error("You are not seated in this room");
  const body = await parse(
    await fetch(`/api/rooms/${encodeURIComponent(code)}/action`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-player-token": token },
      body: JSON.stringify(payload),
    })
  );
  return body.view ?? null;
}
