import { NextResponse } from "next/server";
import { saveFeedback } from "@/server/feedback";
import { fail } from "../_util";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await saveFeedback({
      kind: body?.kind,
      message: String(body?.message ?? ""),
      rating: body?.rating,
      nickname: body?.nickname ?? null,
      roomCode: body?.roomCode ?? null,
      mode: body?.mode ?? null,
      context: body?.context ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
