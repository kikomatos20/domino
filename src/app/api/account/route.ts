import { NextResponse } from "next/server";
import { addressFor, createAccount } from "@/server/accounts";
import { fail } from "../_util";

export const dynamic = "force-dynamic";

/**
 * Create an account.
 *
 * The password is only ever handed to Supabase, which hashes it — it is never
 * stored, logged or echoed here. The reply carries the synthetic address the
 * browser needs to sign in with, and nothing else.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const account = await createAccount(String(body?.username ?? ""), String(body?.password ?? ""));
    return NextResponse.json({
      username: account.username,
      email: addressFor(account.username),
    });
  } catch (error) {
    return fail(error);
  }
}
