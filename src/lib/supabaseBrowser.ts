"use client";

/**
 * The one Supabase client the browser gets.
 *
 * Shared deliberately: a second client would mean a second websocket and a
 * second copy of the session, which is how you end up with a page that is
 * signed in according to one half of itself and signed out according to the
 * other.
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
export function publishableKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && publishableKey());
}

export function browserClient(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publishableKey()!, {
      auth: {
        // Signing in is meant to outlast the tab — that is the entire point of
        // having an account rather than a nickname.
        persistSession: true,
        autoRefreshToken: true,
      },
      // No need to hear about our own noise faster than we can draw it.
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}
