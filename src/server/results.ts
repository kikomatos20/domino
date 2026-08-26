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

export interface Tally {
  played: number;
  won: number;
  lost: number;
  /** Longest run of wins, and the run currently going. */
  bestStreak: number;
  streak: number;
  /** Average points between the two sides at the end. */
  margin: number;
}

export interface PartnerRecord {
  name: string;
  played: number;
  won: number;
}

export interface RoundTotals {
  rounds: number;
  won: number;
  capicuas: number;
  dominoes: number;
  closedWon: number;
  closedLost: number;
  passes: number;
  /** Averages, null until there is anything to average. */
  accuracy: number | null;
  engineAgreement: number | null;
  teamPlay: number | null;
  pipsWhenLosing: number | null;
  /** Accuracy per day, oldest first, for a trend line. */
  trend: { day: string; accuracy: number; rounds: number }[];
}

export interface Stats {
  online: Tally;
  solo: Tally;
  partners: PartnerRecord[];
  onlineRounds: RoundTotals;
  soloRounds: RoundTotals;
}

/** Wins, losses and streaks over a set of matches, newest first. */
function tally(rows: { won: boolean; team_score: number; opponent_score: number }[]): Tally {
  const won = rows.filter((r) => r.won).length;

  // Rows arrive newest first, so the current streak is the leading run.
  let streak = 0;
  for (const r of rows) {
    if (!r.won) break;
    streak++;
  }

  let best = 0;
  let run = 0;
  for (const r of [...rows].reverse()) {
    run = r.won ? run + 1 : 0;
    if (run > best) best = run;
  }

  const margin = rows.length
    ? Math.round(
        rows.reduce((sum, r) => sum + (r.team_score - r.opponent_score), 0) / rows.length
      )
    : 0;

  return { played: rows.length, won, lost: rows.length - won, bestStreak: best, streak, margin };
}

interface RoundRow {
  won: boolean;
  capicua: boolean;
  dominoed: boolean;
  closed: boolean;
  closed_won: boolean;
  passes: number;
  pips_left: number;
  accuracy: number | null;
  engine_agreement: number | null;
  team_play: number | null;
  finished_at: string;
}

function average(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  if (real.length === 0) return null;
  return Math.round(real.reduce((a, b) => a + b, 0) / real.length);
}

function totals(rows: RoundRow[]): RoundTotals {
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    if (r.accuracy === null) continue;
    const day = r.finished_at.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), r.accuracy]);
  }

  return {
    rounds: rows.length,
    won: rows.filter((r) => r.won).length,
    capicuas: rows.filter((r) => r.capicua).length,
    dominoes: rows.filter((r) => r.dominoed).length,
    closedWon: rows.filter((r) => r.closed && r.closed_won).length,
    closedLost: rows.filter((r) => r.closed && !r.closed_won).length,
    passes: rows.reduce((sum, r) => sum + r.passes, 0),
    accuracy: average(rows.map((r) => r.accuracy)),
    engineAgreement: average(rows.map((r) => r.engine_agreement)),
    teamPlay: average(rows.map((r) => r.team_play)),
    pipsWhenLosing: average(rows.filter((r) => !r.won).map((r) => r.pips_left)),
    trend: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, values]) => ({
        day,
        accuracy: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        rounds: values.length,
      })),
  };
}

/**
 * Everything worth showing one player about their own play.
 *
 * Online and solo are kept apart throughout. A solo result is reported by the
 * browser that played it and an online one by the server that ran it, so
 * merging them into a single number would quietly mix two different levels of
 * trust — quite apart from the computer being a different opponent.
 */
export async function statsFor(userId: string): Promise<Stats> {
  const empty: Tally = { played: 0, won: 0, lost: 0, bestStreak: 0, streak: 0, margin: 0 };
  const noRounds = totals([]);
  const db = admin();
  if (!db) {
    return {
      online: empty,
      solo: empty,
      partners: [],
      onlineRounds: noRounds,
      soloRounds: noRounds,
    };
  }

  const [matches, rounds] = await Promise.all([
    db
      .from("match_results")
      .select("won, team_score, opponent_score, room_code, partner_name")
      .eq("user_id", userId)
      .order("finished_at", { ascending: false })
      .limit(500),
    db
      .from("round_stats")
      .select(
        "won, capicua, dominoed, closed, closed_won, passes, pips_left, accuracy, engine_agreement, team_play, room_code, finished_at"
      )
      .eq("user_id", userId)
      .order("finished_at", { ascending: false })
      .limit(2000),
  ]);

  const matchRows = matches.data ?? [];
  const roundRows = (rounds.data ?? []) as (RoundRow & { room_code: string | null })[];

  const onlineMatches = matchRows.filter((r) => r.room_code !== null);
  const soloMatches = matchRows.filter((r) => r.room_code === null);

  // Who you win with. Computers are not partners worth ranking.
  const byPartner = new Map<string, { played: number; won: number }>();
  for (const r of onlineMatches) {
    const name = r.partner_name;
    if (!name || name.startsWith("Computer")) continue;
    const entry = byPartner.get(name) ?? { played: 0, won: 0 };
    entry.played++;
    if (r.won) entry.won++;
    byPartner.set(name, entry);
  }

  return {
    online: tally(onlineMatches),
    solo: tally(soloMatches),
    partners: [...byPartner.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.played - a.played),
    onlineRounds: totals(roundRows.filter((r) => r.room_code !== null)),
    soloRounds: totals(roundRows.filter((r) => r.room_code === null)),
  };
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
