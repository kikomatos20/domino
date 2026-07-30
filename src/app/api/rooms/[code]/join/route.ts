import { NextResponse } from "next/server";
import { joinRoom, viewFor } from "@/server/rooms";
import { roomStore } from "@/server/store";
import { fail } from "../../../_util";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const body = await request.json();
    const { room, token } = await joinRoom(
      roomStore(),
      code,
      String(body?.nickname ?? "")
    );
    return NextResponse.json({ token, view: viewFor(room, token) });
  } catch (error) {
    return fail(error);
  }
}
