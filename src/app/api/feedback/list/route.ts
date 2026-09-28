import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseStore, supabaseConfigured } from "@/server/supabaseStore";
import { fail } from "../../_util";

export const dynamic = "force-dynamic";

/**
 * Read the feedback, for whoever holds the key.
 *
 * Guarded by FEEDBACK_KEY rather than a login: this is a private game with a
 * handful of players, and a shared secret is proportionate. Without the
 * variable set, the endpoint stays shut.
 */
function authorised(request: Request): boolean {
  const expected = process.env.FEEDBACK_KEY;
  if (!expected) return false;
  // Header only: a key in the query string ends up in request logs.
  const given = request.headers.get("x-feedback-key");
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  try {
    if (!authorised(request)) {
      return NextResponse.json(
        { error: "Set FEEDBACK_KEY and send it in the x-feedback-key header" },
        { status: 401 }
      );
    }
    if (!supabaseConfigured()) {
      return NextResponse.json({ items: [], note: "No database configured" });
    }
    const url = new URL(request.url);
    const openOnly = url.searchParams.get("open") === "1";
    const items = await createSupabaseStore().listFeedback(openOnly);
    return NextResponse.json({ items });
  } catch (error) {
    return fail(error);
  }
}

/** Mark an item dealt with, so the list stays meaningful. */
export async function POST(request: Request) {
  try {
    if (!authorised(request)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 401 });
    }
    const body = await request.json();
    await createSupabaseStore().resolveFeedback(String(body?.id), body?.resolved !== false);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
