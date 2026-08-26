/**
 * What happened in one round, for one player.
 *
 * The review already works all of this out and then throws it away when the
 * dialog closes. Keeping a row per round is what turns "how did I play that
 * hand" into "am I getting better", which is the only question a stats page is
 * really for.
 *
 * Solo rounds are stored with no room code and counted separately. A solo game
 * runs entirely in the player's browser, so those numbers are self-reported;
 * online rounds are computed by the server that ran the game.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { statsFor } from "@/engine/roundStats";
import type { RoundStat } from "@/engine/roundStats";
import type { GameState } from "@/engine/types";
import type { Room } from "./types";

let client: SupabaseClient | null = null;

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

function row(userId: string, roomCode: string | null, stat: RoundStat, humans: number) {
  return {
    user_id: userId,
    room_code: roomCode,
    humans,
    round_number: stat.roundNumber,
    seat: stat.seat,
    role_at_start: stat.roleAtStart,
    won: stat.won,
    kind: stat.kind,
    dominoed: stat.dominoed,
    capicua: stat.capicua,
    closed: stat.closed,
    closed_won: stat.closedWon,
    passes: stat.passes,
    pips_left: stat.pipsLeft,
    moves: stat.moves,
    decided: stat.decided,
    accuracy: stat.accuracy,
    engine_agreement: stat.engineAgreement,
    team_play: stat.teamPlay,
    mistakes: stat.mistakes,
    inaccuracies: stat.inaccuracies,
  };
}

/**
 * Store a finished online round for every seat with an account behind it.
 *
 * Never throws into the game: failing to write down a statistic is not a reason
 * to break the table.
 */
export async function recordRound(room: Room, game: GameState): Promise<void> {
  const db = admin();
  if (!db || !game.roundOver) return;

  const rows = room.players
    .filter((p) => p.userId)
    .map((p) => {
      const stat = statsFor(game, p.seat);
      return stat ? row(p.userId as string, room.code, stat, room.players.length) : null;
    })
    .filter((r): r is ReturnType<typeof row> => r !== null);

  if (rows.length === 0) return;
  try {
    await db.from("round_stats").insert(rows);
  } catch {
    // Nothing here is worth interrupting a game for.
  }
}

/** Store a solo round, reported by the browser that played it. */
export async function recordSoloRound(userId: string, stat: RoundStat): Promise<void> {
  const db = admin();
  if (!db) return;
  await db.from("round_stats").insert(row(userId, null, stat, 1));
}
