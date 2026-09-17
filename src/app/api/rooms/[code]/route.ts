import { NextResponse } from "next/server";
import { normaliseCode, viewFor } from "@/server/rooms";
import { withRatings } from "@/server/results";
import { roomStore } from "@/server/store";
import { RoomError } from "@/server/types";
import { fail, tokenFrom } from "../../_util";

export const dynamic = "force-dynamic";

/** The caller's own view of the room — their tiles, nobody else's. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const room = await roomStore().get(normaliseCode(code));
    if (!room) throw new RoomError("No room with that code", 404);
    // Ratings ride along in the lobby only; `withRatings` is a no-op once the
    // match is under way, so a move never waits on a query.
    const view = await withRatings(viewFor(room, tokenFrom(request)), room);
    return NextResponse.json({ view });
  } catch (error) {
    return fail(error);
  }
}
