import { sharedMemoryStore } from "./memoryStore";
import { createSupabaseStore, supabaseConfigured } from "./supabaseStore";
import type { RoomStore } from "./types";

let store: RoomStore | null = null;

/**
 * The room store the API routes use.
 *
 * Supabase when it is configured; otherwise an in-process map so the app still
 * runs locally before any keys exist. The fallback is fine for one developer on
 * one machine and useless in production — rooms would not survive a restart or
 * be shared between serverless instances.
 */
export function roomStore(): RoomStore {
  if (!store) {
    store = supabaseConfigured() ? createSupabaseStore() : sharedMemoryStore();
  }
  return store;
}

export function usingMemoryStore(): boolean {
  return !supabaseConfigured();
}
