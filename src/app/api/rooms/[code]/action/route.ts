import { NextResponse } from "next/server";
import {
  heartbeat,
  leaveRoom,
  markReady,
  playMove,
  playPass,
  postChat,
  requestSwap,
  respondSwap,
  startMatch,
  takeSeat,
  updateSettings,
  viewFor,
} from "@/server/rooms";
import { roomStore } from "@/server/store";
import { RoomError } from "@/server/types";
import type { Seat } from "@/engine/types";
import { fail, requireToken } from "../../../_util";

export const dynamic = "force-dynamic";

/**
 * Every in-room action goes through here, so the rules are enforced in exactly
 * one place. The body says what the player wants; the server decides.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const token = requireToken(request);
    const body = await request.json();
    const store = roomStore();

    switch (body?.action) {
      case "seat": {
        const room = await takeSeat(store, code, token, Number(body.seat) as Seat);
        return NextResponse.json({ view: viewFor(room, token) });
      }
      case "askSwap": {
        const room = await requestSwap(store, code, token, Number(body.seat) as Seat);
        return NextResponse.json({ view: viewFor(room, token) });
      }
      case "answerSwap": {
        const room = await respondSwap(store, code, token, body.accept === true);
        return NextResponse.json({ view: viewFor(room, token) });
      }
      case "settings": {
        const room = await updateSettings(store, code, token, {
          fillWithAi: body.fillWithAi,
          difficulty: body.difficulty,
          target: body.target,
        });
        return NextResponse.json({ view: viewFor(room, token) });
      }
      case "start": {
        const room = await startMatch(store, code, token);
        return NextResponse.json({ view: viewFor(room, token) });
      }
      case "move": {
        const room = await playMove(
          store,
          code,
          token,
          {
            tileId: String(body.tileId),
            end: body.end === "left" ? "left" : "right",
          },
          typeof body.taunt === "string" ? body.taunt : undefined
        );
        return NextResponse.json({ view: viewFor(room, token) });
      }
      case "pass": {
        const room = await playPass(store, code, token);
        return NextResponse.json({ view: viewFor(room, token) });
      }
      case "chat": {
        const room = await postChat(store, code, token, String(body.text ?? ""));
        return NextResponse.json({ view: viewFor(room, token) });
      }
      case "ready": {
        const room = await markReady(store, code, token, body.ready !== false);
        return NextResponse.json({ view: viewFor(room, token) });
      }
      case "leave": {
        const room = await leaveRoom(store, code, token);
        return NextResponse.json({ view: viewFor(room, token) });
      }
      case "ping": {
        await heartbeat(store, code, token);
        return NextResponse.json({ ok: true });
      }
      default:
        throw new RoomError("Unknown action");
    }
  } catch (error) {
    return fail(error);
  }
}
