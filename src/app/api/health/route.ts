import { NextResponse } from "next/server";
import { isDeployed, storageKind } from "@/server/store";
import { createSupabaseStore, supabaseConfigured } from "@/server/supabaseStore";

export const dynamic = "force-dynamic";

/**
 * Pull a readable message out of whatever was thrown.
 *
 * Supabase rejects with plain objects ({ message, code, hint, details }), not
 * Error instances, so an `instanceof Error` check silently loses the one piece
 * of information worth having.
 */
function describe(error: unknown): string {
  if (!error) return "unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts = [e.message, e.code && `[${e.code}]`, e.hint, e.details]
      .filter(Boolean)
      .map(String);
    if (parts.length) return parts.join(" ");
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/** Never echo secrets — just enough to tell a typo from a missing table. */
function shape(value: string | undefined) {
  if (!value) return null;
  return { length: value.length, startsWith: value.slice(0, 6) };
}

export async function GET() {
  const result: Record<string, unknown> = {
    storage: storageKind(),
    deployed: isDeployed(),
    ready: false,
  };

  if (!supabaseConfigured()) {
    result.detail = isDeployed()
      ? "Supabase keys are missing, so online rooms cannot be stored. See SUPABASE.md."
      : "Running on in-memory rooms (fine locally, not for real games).";
    result.ready = !isDeployed();
    result.url = shape(process.env.NEXT_PUBLIC_SUPABASE_URL);
    result.serviceKey = shape(process.env.SUPABASE_SERVICE_ROLE_KEY);
    return NextResponse.json(result);
  }

  try {
    await createSupabaseStore().get("HEALTH");
    result.ready = true;
    result.detail = "Connected — online play is ready.";
  } catch (error) {
    result.detail = describe(error);
    // Enough to spot a truncated key or a URL with a stray slash, no secrets.
    result.url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
    result.serviceKey = shape(process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return NextResponse.json(result);
}
