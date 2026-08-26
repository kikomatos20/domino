import { NextResponse } from "next/server";
import { createRoom, viewFor } from "@/server/rooms";
import { roomStore } from "@/server/store";
import { accountFor } from "@/server/accounts";
import { bearer, fail } from "../_util";

export const dynamic = "force-dynamic";

/** Create a room and seat the caller as host. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Signed in? Then results from this table can be written down. Optional:
    // a guest gets exactly the same game, just no record of it.
    const account = await accountFor(bearer(request));
    const { room, token } = await createRoom(roomStore(), {
      nickname: String(body?.nickname ?? ""),
      fillWithAi: body?.fillWithAi ?? true,
      difficulty: body?.difficulty ?? "medium",
      target: body?.target ?? 100,
      userId: account?.id ?? null,
    });
    return NextResponse.json({ token, view: viewFor(room, token) });
  } catch (error) {
    return fail(error);
  }
}
