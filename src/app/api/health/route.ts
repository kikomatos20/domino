import { NextResponse } from "next/server";
import { isDeployed, storageKind } from "@/server/store";
import { createSupabaseStore, supabaseConfigured } from "@/server/supabaseStore";

export const dynamic = "force-dynamic";

/**
 * Is online play actually going to work here?
 *
 * Reports whether the database is configured and reachable, so a
 * misconfiguration shows up before four people sit down to play rather than
 * three moves in.
 */
export async function GET() {
  const kind = storageKind();
  const result: {
    storage: string;
    deployed: boolean;
    ready: boolean;
    detail?: string;
  } = { storage: kind, deployed: isDeployed(), ready: false };

  if (!supabaseConfigured()) {
    result.detail = isDeployed()
      ? "Supabase keys are missing, so online rooms cannot be stored. See SUPABASE.md."
      : "Running on in-memory rooms (fine locally, not for real games).";
    result.ready = !isDeployed();
    return NextResponse.json(result);
  }

  // Configured — but are the tables actually there?
  try {
    await createSupabaseStore().get("HEALTH");
    result.ready = true;
  } catch (error) {
    result.detail =
      "Supabase is configured but the query failed — did you run supabase/schema.sql? " +
      (error instanceof Error ? error.message : "");
  }
  return NextResponse.json(result);
}
