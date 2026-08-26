import { NextResponse } from "next/server";
import { accountFor } from "@/server/accounts";
import { recordFor, recordSolo } from "@/server/results";
import { fail } from "../_util";

export const dynamic = "force-dynamic";

/** The session token, if the browser sent one. */
function tokenFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/** Your own record. Nobody can ask for anyone else's — there is no parameter. */
export async function GET(request: Request) {
  try {
    const account = await accountFor(tokenFrom(request));
    if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    return NextResponse.json({
      username: account.username,
      record: await recordFor(account.id),
    });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Record a solo match.
 *
 * Solo runs entirely in the browser, so the browser is the only thing that
 * knows the match ended — unlike an online table, where the server ran it. The
 * result is therefore only as trustworthy as the client, which is why solo
 * results are stored separately and never mixed with games against people.
 */
export async function POST(request: Request) {
  try {
    const account = await accountFor(tokenFrom(request));
    if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const body = await request.json();
    const teamScore = Number(body?.teamScore);
    const opponentScore = Number(body?.opponentScore);
    const rounds = Number(body?.rounds);
    if (![teamScore, opponentScore, rounds].every(Number.isFinite)) {
      return NextResponse.json({ error: "Incomplete result" }, { status: 422 });
    }

    await recordSolo(account.id, {
      won: teamScore > opponentScore,
      teamScore,
      opponentScore,
      rounds,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
