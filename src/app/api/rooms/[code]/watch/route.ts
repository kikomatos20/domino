import { NextResponse } from "next/server";
import { viewFor, watchRoom } from "@/server/rooms";
import { roomStore } from "@/server/store";
import { accountFor } from "@/server/accounts";
import { bearer, fail } from "../../../_util";

export const dynamic = "force-dynamic";

/**
 * Pull up a chair without taking a seat.
 *
 * Unlike joining, this needs an account. The nickname comes from the account
 * rather than the request: a watcher may end up being shown someone's hand, and
 * the name attached to that has to be one the players can recognise and hold to
 * a decision, not whatever the browser felt like sending.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const account = await accountFor(bearer(request));
    const { room, token } = await watchRoom(
      roomStore(),
      code,
      account?.username ?? "",
      account?.id ?? null
    );
    return NextResponse.json({ token, view: viewFor(room, token) });
  } catch (error) {
    return fail(error);
  }
}
