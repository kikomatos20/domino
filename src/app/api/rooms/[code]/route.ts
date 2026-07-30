import { NextResponse } from "next/server";
import { normaliseCode, viewFor } from "@/server/rooms";
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
    return NextResponse.json({ view: viewFor(room, tokenFrom(request)) });
  } catch (error) {
    return fail(error);
  }
}
