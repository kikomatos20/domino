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
  /** Their avatar colour. */
  colour: string;
}

/**
 * The colours anyone can pick from.
 *
 * A fixed set rather than a free colour picker: every one of these is legible
 * with dark text on it and sits with the table's palette. A free picker would
 * let someone choose something invisible against the felt.
 */
export const AVATAR_COLOURS = [
  "#d4af37",
  "#5ec4e8",
  "#7fd6a0",
  "#c9a0dc",
  "#e8985e",
  "#e87f7f",
  "#8ea9e8",
  "#e8d95e",
] as const;

export const DEFAULT_COLOUR = AVATAR_COLOURS[0];

const DOMAIN = "players.domino.invalid";

function addressFor(username: string): string {
  return `${username.trim().toLowerCase()}@${DOMAIN}`;
}

function readAccount(user: { id: string; email?: string; user_metadata?: unknown }): Account {
  const meta = user.user_metadata as { username?: string; colour?: string } | null;
  const colour = meta?.colour;
  return {
    id: user.id,
    username: meta?.username ?? (user.email?.split("@")[0] ?? "player"),
    // Only a colour from the list — never whatever happens to be stored.
    colour: colour && (AVATAR_COLOURS as readonly string[]).includes(colour)
      ? colour
      : DEFAULT_COLOUR,
  };
}

/**
 * Change your avatar colour.
 *
 * Kept on the account itself rather than in a table of its own: it travels
 * with the session, so the menu badge changes the moment you pick one, with no
 * extra request from every page that draws it.
 */
export async function setColour(colour: string): Promise<void> {
  const db = browserClient();
  if (!db) return;
  if (!(AVATAR_COLOURS as readonly string[]).includes(colour)) return;
  await db.auth.updateUser({ data: { colour } });
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

/**
 * Who is signed in, if anyone.
 *
 * Reads the stored session rather than asking the server, so every page can
 * show whether you are signed in without a round trip. Good enough to draw a
 * badge with; anything that actually matters is verified server-side against
 * the token, not against this.
 */
export async function currentAccount(): Promise<Account | null> {
  const db = browserClient();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session?.user ? readAccount(data.session.user) : null;
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
  const session = data.session;
  if (!session) return null;

  /**
   * Refresh before sending, not after being refused.
   *
   * Access tokens are short-lived. The stored one can easily be stale by the
   * time a page loads — which looks, from the outside, exactly like being
   * signed out: the name still shows because that is read locally, while every
   * request comes back 401.
   */
  const expiresAt = (session.expires_at ?? 0) * 1000;
  if (expiresAt && expiresAt - Date.now() < 60_000) {
    const { data: refreshed } = await db.auth.refreshSession();
    return refreshed.session?.access_token ?? null;
  }
  return session.access_token;
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

export interface Tally {
  played: number;
  won: number;
  lost: number;
  bestStreak: number;
  streak: number;
  margin: number;
}

export interface RoundTotals {
  rounds: number;
  won: number;
  capicuas: number;
  dominoes: number;
  closedWon: number;
  closedLost: number;
  passes: number;
  accuracy: number | null;
  engineAgreement: number | null;
  teamPlay: number | null;
  pipsWhenLosing: number | null;
  trend: { day: string; accuracy: number; rounds: number }[];
}

export interface Stats {
  achievements: import("@/engine/achievements").Achievement[];
  online: Tally;
  solo: Tally;
  partners: { name: string; played: number; won: number }[];
  onlineRounds: RoundTotals;
  soloRounds: RoundTotals;
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await accessToken();
  return token ? { authorization: `Bearer ${token}` } : null;
}

/** Your own wins, losses and everything derived from them. */
export async function fetchRecord(): Promise<{
  record: PlayRecord;
  stats: Stats;
} | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  const response = await fetch("/api/results", { headers, cache: "no-store" });
  if (!response.ok) return null;
  const body = await response.json();
  return body.record ? { record: body.record, stats: body.stats } : null;
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
  matchId: string;
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

/** Report a finished solo round. Same silence on failure as the match report. */
export async function reportSoloRound(round: unknown): Promise<void> {
  try {
    const headers = await authHeaders();
    if (!headers) return;
    await fetch("/api/results", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ round }),
    });
  } catch {
    // Not worth surfacing.
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
