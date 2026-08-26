"use client";

/**
 * Live notification that a room has changed.
 *
 * The browser subscribes straight to Supabase over a websocket, so a move
 * reaches the other players without touching our own server at all. That is
 * the whole point: polling costs a serverless invocation every time and almost
 * always reports that nothing happened, while a broadcast costs nothing and
 * arrives the instant it matters.
 *
 * Only a version number travels on the wire — never game data. Anyone who
 * eavesdropped on a room's channel would learn that something changed and
 * nothing about anybody's tiles.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * The browser-safe key, under either name.
 *
 * Supabase replaced the legacy `anon` JWT with a publishable key
 * (`sb_publishable_…`). Both work here, so a project on either scheme is fine.
 *
 * These have to be written out in full rather than looked up dynamically —
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time by matching the
 * literal text, so a computed key name would come back undefined.
 */
function publishableKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

/** Configured only if the browser has been given a publishable key. */
export function realtimeConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && publishableKey());
}

function browserClient(): SupabaseClient | null {
  if (!realtimeConfigured()) return null;
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      publishableKey()!,
      {
        auth: { persistSession: false },
        // No need to hear about our own noise faster than we can draw it.
        realtime: { params: { eventsPerSecond: 5 } },
      }
    );
  }
  return client;
}

export interface RoomChannel {
  close(): void;
}

/**
 * Listen for changes to one room.
 *
 * `onChange` fires with the new version; `onStatus` reports whether the socket
 * is actually up, so the caller can fall back to polling harder when it is not.
 * Returns null when realtime is not configured, which is a normal state — the
 * app then behaves exactly as it did before.
 */
export function watchRoom(
  code: string,
  onChange: (version: number) => void,
  onStatus: (live: boolean) => void
): RoomChannel | null {
  const db = browserClient();
  if (!db) return null;

  const channel = db.channel(`room:${code}`, { config: { broadcast: { self: false } } });

  channel
    .on("broadcast", { event: "changed" }, (message) => {
      const version = Number(
        (message?.payload as { version?: unknown } | undefined)?.version
      );
      if (Number.isFinite(version)) onChange(version);
    })
    .subscribe((status) => {
      // Anything other than a live subscription means we are on our own.
      onStatus(status === "SUBSCRIBED");
    });

  return {
    close() {
      onStatus(false);
      db.removeChannel(channel);
    },
  };
}
