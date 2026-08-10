/**
 * Storing what players tell us.
 *
 * Feedback is only as useful as the context attached to it, so every note
 * carries the position it was written about. A complaint about a review verdict
 * arrives with the hands, the table and the verdict itself — enough to rebuild
 * the exact position in a test.
 */

import { createSupabaseStore, supabaseConfigured } from "./supabaseStore";
import { RoomError } from "./types";

export interface FeedbackInput {
  kind: "general" | "review" | "bug";
  message: string;
  rating?: number | null;
  nickname?: string | null;
  roomCode?: string | null;
  mode?: "solo" | "online" | null;
  context?: unknown;
}

const MAX_MESSAGE = 2000;
const MAX_CONTEXT_BYTES = 200_000;

export function cleanFeedback(input: FeedbackInput): FeedbackInput {
  const message = (input.message ?? "").trim();
  if (!message) throw new RoomError("Write something first");
  if (message.length > MAX_MESSAGE) {
    throw new RoomError(`Please keep it under ${MAX_MESSAGE} characters`);
  }

  let context = input.context ?? null;
  // A runaway payload is not worth rejecting the note over — drop it instead.
  if (context && JSON.stringify(context).length > MAX_CONTEXT_BYTES) {
    context = { note: "context omitted: too large" };
  }

  const kind =
    input.kind === "review" || input.kind === "bug" ? input.kind : "general";

  return {
    kind,
    message,
    rating:
      typeof input.rating === "number" && input.rating >= -1 && input.rating <= 1
        ? input.rating
        : null,
    nickname: input.nickname?.slice(0, 32) ?? null,
    roomCode: input.roomCode?.slice(0, 12) ?? null,
    mode: input.mode === "solo" || input.mode === "online" ? input.mode : null,
    context,
  };
}

export async function saveFeedback(input: FeedbackInput): Promise<void> {
  const clean = cleanFeedback(input);

  if (!supabaseConfigured()) {
    // Nowhere to put it locally — at least make it visible to the developer.
    console.log("[domino] feedback (not stored, no database):", clean);
    return;
  }

  const { error } = await createSupabaseStore().insertFeedback({
    kind: clean.kind,
    message: clean.message,
    rating: clean.rating ?? null,
    nickname: clean.nickname ?? null,
    room_code: clean.roomCode ?? null,
    mode: clean.mode ?? null,
    context: clean.context ?? null,
    app_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "dev",
  });
  if (error) throw error;
}
