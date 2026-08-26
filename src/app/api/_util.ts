import { NextResponse } from "next/server";
import { RoomError } from "@/server/types";

/** Turn an error into a response without leaking internals to the browser. */
export function fail(error: unknown) {
  if (error instanceof RoomError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  // Supabase rejects with plain objects rather than Errors, so log the whole
  // thing — `error.message` alone would come out empty.
  console.error("[domino] unexpected error", JSON.stringify(error, null, 2), error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

/** The player's secret, sent as a header so it stays out of URLs and logs. */
export function tokenFrom(request: Request): string | null {
  return request.headers.get("x-player-token");
}

/**
 * The account session, if the browser sent one.
 *
 * Separate from the player token on purpose: the seat token is what runs the
 * game, and this only decides whether the result is written down. Ordinary play
 * never needs to verify it.
 */
export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

export function requireToken(request: Request): string {
  const token = tokenFrom(request);
  if (!token) throw new RoomError("Missing player token", 401);
  return token;
}
