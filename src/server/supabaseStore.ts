/**
 * Supabase-backed room storage.
 *
 * Only this file talks to the database, and only ever with the service-role
 * key from the server. Browsers cannot read these tables at all (row level
 * security denies everything), which is what keeps the hands hidden.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChatEntry, Room, RoomStore } from "./types";
import type { Difficulty } from "@/engine/ai";
import type { GameState, Seat } from "@/engine/types";

let client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function admin(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase is not configured");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

interface RoomRow {
  id: string;
  code: string;
  status: Room["status"];
  fill_with_ai: boolean;
  difficulty: Difficulty;
  target: number;
  host_token: string;
  version: number;
  chat: ChatEntry[] | null;
  updated_at: string;
}

interface PlayerRow {
  seat: number;
  nickname: string;
  token: string;
  connected: boolean;
  last_seen: string;
  ready: boolean | null;
  wants_seat: number | null;
}

/** Rows written to the feedback table. */
export interface FeedbackRow {
  kind: string;
  message: string;
  rating: number | null;
  nickname: string | null;
  room_code: string | null;
  mode: string | null;
  context: unknown;
  app_version: string;
}

export function createSupabaseStore(): RoomStore & {
  insertFeedback(row: FeedbackRow): Promise<{ error: unknown }>;
  listFeedback(openOnly: boolean): Promise<unknown[]>;
  resolveFeedback(id: string, resolved: boolean): Promise<void>;
} {
  return {
    async insertFeedback(row) {
      const { error } = await admin().from("feedback").insert(row);
      return { error };
    },

    async listFeedback(openOnly) {
      let query = admin()
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (openOnly) query = query.eq("resolved", false);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async resolveFeedback(id, resolved) {
      const { error } = await admin().from("feedback").update({ resolved }).eq("id", id);
      if (error) throw error;
    },

    async get(code) {
      const db = admin();
      const { data: room, error } = await db
        .from("rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle<RoomRow>();
      if (error) throw error;
      if (!room) return null;

      const [{ data: players }, { data: game }] = await Promise.all([
        db
          .from("players")
          .select("*")
          .eq("room_id", room.id)
          .order("seat")
          .returns<PlayerRow[]>(),
        db
          .from("games")
          .select("state")
          .eq("room_id", room.id)
          .maybeSingle<{ state: GameState }>(),
      ]);

      return {
        code: room.code,
        status: room.status,
        fillWithAi: room.fill_with_ai,
        difficulty: room.difficulty,
        target: room.target,
        hostToken: room.host_token,
        players: (players ?? []).map((p) => ({
          seat: p.seat as Seat,
          nickname: p.nickname,
          token: p.token,
          connected: p.connected,
          lastSeen: new Date(p.last_seen).getTime(),
          ready: p.ready ?? false,
          wantsSeat: (p.wants_seat ?? null) as Seat | null,
        })),
        game: game?.state ?? undefined,
        chat: room.chat ?? [],
        // Lives on the room, so it is meaningful in the lobby too.
        version: room.version ?? 0,
        updatedAt: new Date(room.updated_at).getTime(),
      };
    },

    async create(room) {
      const db = admin();
      const { data, error } = await db
        .from("rooms")
        .insert({
          code: room.code,
          status: room.status,
          fill_with_ai: room.fillWithAi,
          difficulty: room.difficulty,
          target: room.target,
          host_token: room.hostToken,
        })
        .select("id")
        .single<{ id: string }>();
      if (error) throw error;

      if (room.players.length) {
        const { error: playerError } = await db.from("players").insert(
          room.players.map((p) => ({
            room_id: data.id,
            seat: p.seat,
            nickname: p.nickname,
            token: p.token,
            connected: p.connected,
          }))
        );
        if (playerError) throw playerError;
      }
    },

    /**
     * One transaction, one round trip.
     *
     * This used to be four separate requests, including a delete-then-insert of
     * the player rows — anyone reading in that gap saw a room with nobody in it.
     * `save_room` writes the room, its seats and the game state atomically, so
     * readers only ever see a complete room.
     */
    async put(room) {
      const { error } = await admin().rpc("save_room", {
        p_code: room.code,
        p_status: room.status,
        p_fill: room.fillWithAi,
        p_difficulty: room.difficulty,
        p_target: room.target,
        p_host: room.hostToken,
        p_version: room.version,
        p_players: room.players.map((p) => ({
          seat: p.seat,
          nickname: p.nickname,
          token: p.token,
          connected: p.connected,
          lastSeen: p.lastSeen,
          ready: p.ready,
          wantsSeat: p.wantsSeat,
        })),
        p_state: room.game ?? null,
        p_chat: room.chat ?? [],
      });
      if (error) throw error;
    },

    /**
     * Flag one player ready. A targeted update, not a whole-room write, so two
     * people clicking Ready at the same instant both stick.
     */
    async setReady(code, token, ready) {
      const db = admin();
      const { data: room } = await db
        .from("rooms")
        .select("id")
        .eq("code", code)
        .maybeSingle<{ id: string }>();
      if (!room) return;
      await db
        .from("players")
        .update({ ready })
        .eq("room_id", room.id)
        .eq("token", token);
    },

    /** Mark a player present without rewriting the game. */
    async touchPlayer(code, token) {
      const db = admin();
      const { data: room } = await db
        .from("rooms")
        .select("id")
        .eq("code", code)
        .maybeSingle<{ id: string }>();
      if (!room) return;
      await db
        .from("players")
        .update({ connected: true, last_seen: new Date().toISOString() })
        .eq("room_id", room.id)
        .eq("token", token);
    },

    /**
     * Nudge everyone watching the room. Only the version travels — never any
     * game data — so clients refetch their own redacted view.
     */
    async notify(code, version) {
      try {
        const channel = admin().channel(`room:${code}`);
        await channel.send({
          type: "broadcast",
          event: "changed",
          payload: { version },
        });
        await admin().removeChannel(channel);
      } catch {
        // A missed ping only costs a slightly later refresh; clients also poll.
      }
    },
  };
}
