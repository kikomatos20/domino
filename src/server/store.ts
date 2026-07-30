import { sharedMemoryStore } from "./memoryStore";
import { createSupabaseStore, supabaseConfigured } from "./supabaseStore";
import { RoomError } from "./types";
import type { RoomStore } from "./types";

let store: RoomStore | null = null;

/** Vercel and any other real deployment; not `npm run dev` on your laptop. */
export function isDeployed(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

/**
 * The room store the API routes use.
 *
 * Supabase when configured. Otherwise an in-process map — but *only* on a
 * developer machine. Deployed, that fallback is worse than useless: every
 * serverless instance has its own memory, so a room created by one request
 * disappears on the next, mid-game, with no explanation. We refuse instead.
 */
export function roomStore(): RoomStore {
  if (supabaseConfigured()) {
    store ??= createSupabaseStore();
    return store;
  }
  if (isDeployed()) {
    throw new RoomError(
      "Online play is not configured on this deployment yet — the database keys are missing.",
      503
    );
  }
  return sharedMemoryStore();
}

export function storageKind(): "supabase" | "memory" {
  return supabaseConfigured() ? "supabase" : "memory";
}
