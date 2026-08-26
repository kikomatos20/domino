/**
 * Accounts: a username and a password, and nothing else.
 *
 * Supabase's auth is built around email, and its built-in mail is capped at two
 * messages an hour for a whole project — useless for sign-ups. So a username is
 * stored against a synthetic address that is never written to and never sent
 * anything, and accounts are created server-side already confirmed. No mail is
 * involved at any point.
 *
 * The trade is that there is no password reset, because a reset would need an
 * email to send it to. That is an honest limitation of a free, mail-free
 * account, and it is why linking a real identity later matters.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RoomError } from "./types";

/**
 * The domain behind every username. `.invalid` is reserved by RFC 2606 for
 * exactly this: an address that is guaranteed never to resolve, so nobody can
 * mistake it for somewhere mail might arrive.
 */
const ACCOUNT_DOMAIN = "players.domino.invalid";

const USERNAME = /^[a-z0-9][a-z0-9_.-]{1,15}$/i;
const MIN_PASSWORD = 8;

let client: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new RoomError("Accounts are not configured", 503);
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

/** Usernames are compared without case, so "Kiko" and "kiko" are one person. */
export function normaliseUsername(raw: string): string {
  return (raw ?? "").trim().toLowerCase();
}

export function addressFor(username: string): string {
  return `${normaliseUsername(username)}@${ACCOUNT_DOMAIN}`;
}

function validate(username: string, password: string): void {
  if (!USERNAME.test(username)) {
    throw new RoomError(
      "Usernames are 2–16 characters: letters, numbers, dots, dashes and underscores.",
      422
    );
  }
  if ((password ?? "").length < MIN_PASSWORD) {
    throw new RoomError(`Passwords need at least ${MIN_PASSWORD} characters.`, 422);
  }
}

export interface Account {
  id: string;
  username: string;
}

/**
 * Create an account.
 *
 * Server-side and pre-confirmed, so Supabase never tries to send a
 * confirmation. The profile row is what makes the username unique; if claiming
 * it loses a race, the half-made auth user is removed rather than left behind.
 */
export async function createAccount(
  rawUsername: string,
  password: string
): Promise<Account> {
  const username = normaliseUsername(rawUsername);
  validate(username, password);

  const db = admin();
  const { data, error } = await db.auth.admin.createUser({
    email: addressFor(username),
    password,
    email_confirm: true,
    user_metadata: { username },
  });

  if (error || !data.user) {
    const message = (error as { message?: string } | null)?.message ?? "";
    if (/already/i.test(message)) {
      throw new RoomError("That name is taken.", 409);
    }
    throw new RoomError(message || "Could not create the account", 500);
  }

  const { error: profileError } = await db
    .from("profiles")
    .insert({ id: data.user.id, username });

  if (profileError) {
    // Don't strand an auth user with no profile behind it.
    await db.auth.admin.deleteUser(data.user.id).catch(() => {});
    throw new RoomError("That name is taken.", 409);
  }

  return { id: data.user.id, username };
}

/**
 * Who a session belongs to, or null.
 *
 * Deliberately not called on the hot path — a poll does not need to know who
 * you are, only which seat's token it holds. This runs when a result is
 * recorded or a record is read.
 */
export async function accountFor(accessToken: string | null): Promise<Account | null> {
  if (!accessToken) return null;
  try {
    const { data, error } = await admin().auth.getUser(accessToken);
    if (error || !data.user) return null;
    const username =
      (data.user.user_metadata as { username?: string } | null)?.username ??
      normaliseUsername(data.user.email?.split("@")[0] ?? "");
    return username ? { id: data.user.id, username } : null;
  } catch {
    return null;
  }
}
