/**
 * What a signed-in player has to show for their evening.
 *
 * One row per finished match, per account. Guests record nothing — that is the
 * whole difference an account makes, and why nothing here is required to play.
 *
 * Matches are recorded, not rounds. "Wins and losses" means matches to a
 * hundred; a round is a hand within one.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Room } from "./types";
import type { GameState, Seat } from "@/engine/types";

let client: SupabaseClient | null = null;

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export interface MatchResult {
  won: boolean;
  teamScore: number;
  opponentScore: number;
  rounds: number;
  roomCode: string | null;
  partnerName: string | null;
  /** Against the computer rather than people. Kept apart deliberately. */
  solo: boolean;
  finishedAt: string;
}

export interface PlayRecord {
  played: number;
  won: number;
  lost: number;
  recent: MatchResult[];
}

/**
 * Record a finished online match for whoever at the table was signed in.
 *
 * Never throws into the game: a match that cannot be written down is a
 * disappointment, not a reason to break the table for everyone at it.
 */
export async function recordMatch(room: Room, game: GameState): Promise<void> {
  const db = admin();
  if (!db || !game.matchOver) return;

  const rows = room.players
    .filter((p) => p.userId)
    .map((p) => {
      const team = p.seat % 2;
      const partner = room.players.find((o) => o.seat === ((p.seat + 2) % 4 as Seat));
      return {
        user_id: p.userId as string,
        room_code: room.code,
        won: game.matchScore[team] > game.matchScore[1 - team],
        team_score: game.matchScore[team],
        opponent_score: game.matchScore[1 - team],
        rounds: game.roundNumber,
        partner_name: partner?.nickname ?? "Computer",
      };
    });

  if (rows.length === 0) return;
  try {
    await db.from("match_results").insert(rows);
  } catch {
    // Losing a record is not worth interrupting a game over.
  }
}

/** Record a solo match, reported by the browser that played it. */
export async function recordSolo(
  userId: string,
  result: { won: boolean; teamScore: number; opponentScore: number; rounds: number }
): Promise<void> {
  const db = admin();
  if (!db) return;
  await db.from("match_results").insert({
    user_id: userId,
    room_code: null,
    won: result.won,
    team_score: result.teamScore,
    opponent_score: result.opponentScore,
    rounds: result.rounds,
    partner_name: "Computer",
  });
}

/** Everything one account has played, most recent first. */
export async function recordFor(userId: string): Promise<PlayRecord> {
  const db = admin();
  if (!db) return { played: 0, won: 0, lost: 0, recent: [] };

  const { data, error } = await db
    .from("match_results")
    .select("won, team_score, opponent_score, rounds, room_code, partner_name, finished_at")
    .eq("user_id", userId)
    .order("finished_at", { ascending: false })
    .limit(50);

  if (error || !data) return { played: 0, won: 0, lost: 0, recent: [] };

  const recent: MatchResult[] = data.map((r) => ({
    won: r.won,
    teamScore: r.team_score,
    opponentScore: r.opponent_score,
    rounds: r.rounds,
    roomCode: r.room_code,
    partnerName: r.partner_name,
    solo: r.room_code === null,
    finishedAt: r.finished_at,
  }));

  const won = recent.filter((r) => r.won).length;
  return { played: recent.length, won, lost: recent.length - won, recent };
}
