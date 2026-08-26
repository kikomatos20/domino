"use client";

/**
 * Signing in, from the browser's side.
 *
 * A username is all anyone types. The synthetic address it maps to is an
 * implementation detail of Supabase's email-shaped auth and never appears in
 * the interface.
 *
 * Passwords go straight to Supabase over TLS and are never stored here — not
 * in state, not in localStorage. What persists is the session Supabase manages.
 */

import { browserClient, supabaseConfigured } from "./supabaseBrowser";

export const accountsAvailable = supabaseConfigured;

export interface Account {
  id: string;
  username: string;
}

const DOMAIN = "players.domino.invalid";

function addressFor(username: string): string {
  return `${username.trim().toLowerCase()}@${DOMAIN}`;
}

function readAccount(user: { id: string; email?: string; user_metadata?: unknown }): Account {
  const meta = user.user_metadata as { username?: string } | null;
  return {
    id: user.id,
    username: meta?.username ?? (user.email?.split("@")[0] ?? "player"),
  };
}

/** Create an account, then sign into it. */
export async function signUp(username: string, password: string): Promise<Account> {
  const response = await fetch("/api/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? "Could not create the account");
  return signIn(username, password);
}

export async function signIn(username: string, password: string): Promise<Account> {
  const db = browserClient();
  if (!db) throw new Error("Accounts are not available here");

  const { data, error } = await db.auth.signInWithPassword({
    email: addressFor(username),
    password,
  });
  // Deliberately vague: saying which half was wrong tells an outsider which
  // usernames exist.
  if (error || !data.user) throw new Error("That name and password do not match");
  return readAccount(data.user);
}

export async function signOut(): Promise<void> {
  await browserClient()?.auth.signOut();
}

/** Who is signed in, if anyone. */
export async function currentAccount(): Promise<Account | null> {
  const db = browserClient();
  if (!db) return null;
  const { data } = await db.auth.getUser();
  return data.user ? readAccount(data.user) : null;
}

/**
 * The session token to send when the server needs to know who you are.
 *
 * Only used where identity actually matters — recording a result, reading your
 * own record. The game itself still runs on the per-room seat token, so
 * ordinary play costs no extra verification.
 */
export async function accessToken(): Promise<string | null> {
  const db = browserClient();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session?.access_token ?? null;
}

export interface MatchResult {
  won: boolean;
  teamScore: number;
  opponentScore: number;
  rounds: number;
  roomCode: string | null;
  partnerName: string | null;
  solo: boolean;
  finishedAt: string;
}

export interface PlayRecord {
  played: number;
  won: number;
  lost: number;
  recent: MatchResult[];
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await accessToken();
  return token ? { authorization: `Bearer ${token}` } : null;
}

/** Your own wins and losses. Null when nobody is signed in. */
export async function fetchRecord(): Promise<PlayRecord | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  const response = await fetch("/api/results", { headers, cache: "no-store" });
  if (!response.ok) return null;
  const body = await response.json();
  return body.record ?? null;
}

/**
 * Report a finished solo match.
 *
 * Silent on failure: losing a record is not worth an error message in the face
 * of someone who has just finished a game.
 */
export async function reportSolo(result: {
  teamScore: number;
  opponentScore: number;
  rounds: number;
}): Promise<void> {
  try {
    const headers = await authHeaders();
    if (!headers) return;
    await fetch("/api/results", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(result),
    });
  } catch {
    // Nothing to do about it, and nothing worth saying.
  }
}

/** React to signing in or out anywhere in the app. */
export function onAccountChange(handler: (account: Account | null) => void): () => void {
  const db = browserClient();
  if (!db) return () => {};
  const { data } = db.auth.onAuthStateChange((_event, session) => {
    handler(session?.user ? readAccount(session.user) : null);
  });
  return () => data.subscription.unsubscribe();
}
