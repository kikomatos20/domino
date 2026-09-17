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
import type { PlayerView, Room } from "./types";
import { achievementsFor } from "@/engine/achievements";
import type { Achievement } from "@/engine/achievements";
import { ratingsFrom } from "@/engine/rating";
import type { RatedMatch, Rating } from "@/engine/rating";
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
        match_id: game.matchId,
        won: game.matchScore[team] > game.matchScore[1 - team],
        team_score: game.matchScore[team],
        opponent_score: game.matchScore[1 - team],
        rounds: game.roundNumber,
        partner_name: partner?.nickname ?? "Computer",
        // Which level the computers were on, so "the bot is trash" can be tied
        // to a difficulty rather than guessed at.
        difficulty: room.difficulty,
        // Who actually sat down. A room full of computers is a solo game with
        // a room code, and must not count as a win against people.
        humans: room.players.length,
        // Settled at the deal, in startMatch. Read rather than recomputed:
        // somebody may have dropped since, and a match that started rated
        // stays rated.
        rated: room.rated !== false,
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
  result: {
    won: boolean;
    teamScore: number;
    opponentScore: number;
    rounds: number;
    matchId?: string;
    difficulty?: string;
  }
): Promise<void> {
  const db = admin();
  if (!db) return;
  await db.from("match_results").insert({
    user_id: userId,
    room_code: null,
    match_id: result.matchId ?? null,
    difficulty: result.difficulty ?? null,
    won: result.won,
    team_score: result.teamScore,
    opponent_score: result.opponentScore,
    rounds: result.rounds,
    partner_name: "Computer",
    humans: 1,
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
  /** Earned against people only — see achievements.ts for why. */
  achievements: Achievement[];
  /**
   * Null until you have played a rated match. Worked out from the whole pool's
   * history, because what a result is worth depends on who else was there.
   */
  rating: Rating | null;
  online: Tally;
  solo: Tally;
  partners: PartnerRecord[];
  onlineRounds: RoundTotals;
  soloRounds: RoundTotals;
}

/**
 * Did this game have anyone else in it?
 *
 * Not the same question as "was there a room code". Opening a private room and
 * letting the computer fill the other three seats is a solo game wearing a room
 * code, and counting those as wins against people would make the record
 * meaningless — you could farm it against the easy computer.
 */
export function againstPeople(row: { humans?: number | null }): boolean {
  return (row.humans ?? 1) >= 2;
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
  mistakes: number;
  inaccuracies: number;
  decided: number;
  role_at_start: string | null;
  capicua: boolean;
  dominoed: boolean;
  closed: boolean;
  closed_won: boolean;
  passes: number;
  pips_left: number;
  accuracy: number | null;
  engine_agreement: number | null;
  team_play: number | null;
  /** Null on rounds recorded before these were kept. */
  team_calls: number | null;
  kept_cabeza: number | null;
  led_throughout: boolean | null;
  partner_passed: boolean | null;
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
interface PoolRow {
  match_id: string | null;
  user_id: string;
  won: boolean;
  team_score: number;
  opponent_score: number;
  humans: number | null;
  room_code: string | null;
  finished_at: string;
}

/**
 * Everyone's rating, worked out from everyone's matches.
 *
 * A rating cannot be computed from one person's rows. What a result is worth
 * depends on who was across the table, and their strength comes from matches
 * you may not have played in. So this reads the pool, not the player.
 *
 * That is a whole-table read on every stats page. It stays cheap because the
 * pool is small and the rows are narrow, and it buys the thing that matters:
 * nothing is stored, so a constant in the rating can be retuned and every
 * number re-derives itself correctly on the next load.
 */
async function poolRatings(): Promise<Map<string, Rating>> {
  const db = admin();
  if (!db) return new Map();

  const { data } = await db
    .from("match_results")
    .select("match_id, user_id, won, team_score, opponent_score, humans, room_code, finished_at")
    // Rated matches only: four accounts at the table, agreed beforehand.
    // Everything else is a friendly and moves nobody's number.
    .eq("rated", true)
    .order("finished_at", { ascending: true })
    .limit(4000);

  const rows = ((data ?? []) as PoolRow[]).filter(againstPeople);

  // One row per player per match, so gather them back into matches. Rows with
  // no match id predate that column and cannot be grouped — a round of four
  // ungrouped rows would be read as four separate matches, which would be
  // worse than leaving them out.
  const byMatch = new Map<string, PoolRow[]>();
  for (const row of rows) {
    if (!row.match_id) continue;
    byMatch.set(row.match_id, [...(byMatch.get(row.match_id) ?? []), row]);
  }

  const matches: RatedMatch[] = [];
  for (const group of byMatch.values()) {
    const winners = group.filter((r) => r.won);
    const losers = group.filter((r) => !r.won);
    // Either side tells us the score; take whichever side we actually have.
    const sample = winners[0] ?? losers[0];
    if (!sample) continue;
    const winningScore = sample.won ? sample.team_score : sample.opponent_score;
    const losingScore = sample.won ? sample.opponent_score : sample.team_score;

    matches.push({
      finishedAt: sample.finished_at,
      teamA: winners.map((r) => r.user_id),
      teamB: losers.map((r) => r.user_id),
      scoreA: winningScore,
      scoreB: losingScore,
    });
  }

  return ratingsFrom(matches);
}

/**
 * Pool ratings, held briefly.
 *
 * Every player in a lobby polls, and the rating of a table full of people does
 * not change while they are sitting in it — so re-reading the whole pool for
 * each of those polls would be four identical queries every few seconds. A
 * short window is plenty: a rating only moves when a match finishes, and
 * anyone who has just finished one is looking at the scoreboard, not the
 * lobby.
 */
let cached: { at: number; ratings: Map<string, Rating> } | null = null;
const RATING_TTL = 30_000;

async function cachedPoolRatings(): Promise<Map<string, Rating>> {
  if (cached && Date.now() - cached.at < RATING_TTL) return cached.ratings;
  const ratings = await poolRatings();
  cached = { at: Date.now(), ratings };
  return ratings;
}

/**
 * Put each seat's rating into a view, for the lobby.
 *
 * Deliberately not part of `viewFor`, which is pure and knows nothing about
 * the database — and deliberately lobby-only, because this costs a query and
 * nobody needs their partner's rating refreshed while a tile is in the air.
 *
 * Account ids stay on this side of the line. What goes out is a number.
 */
export async function withRatings(
  view: PlayerView,
  room: Room
): Promise<PlayerView> {
  if (room.status !== "lobby") return view;

  let ratings: Map<string, Rating>;
  try {
    ratings = await cachedPoolRatings();
  } catch {
    // A rating is a nicety. Never hold up a lobby for one.
    return view;
  }
  if (ratings.size === 0) return view;

  return {
    ...view,
    seats: view.seats.map((seat) => {
      const player = room.players.find((p) => p.seat === seat.seat);
      const found = player?.userId ? ratings.get(player.userId) : undefined;
      return found
        ? { ...seat, rating: found.rating, provisional: found.provisional }
        : seat;
    }),
  };
}

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
      achievements: achievementsFor([], []),
      rating: null,
    };
  }

  const [matches, rounds, ratings] = await Promise.all([
    db
      .from("match_results")
      .select("won, team_score, opponent_score, room_code, partner_name, humans, finished_at")
      .eq("user_id", userId)
      .order("finished_at", { ascending: false })
      .limit(500),
    db
      .from("round_stats")
      .select(
        "won, capicua, dominoed, closed, closed_won, passes, pips_left, accuracy, engine_agreement, team_play, team_calls, kept_cabeza, led_throughout, partner_passed, mistakes, inaccuracies, decided, role_at_start, room_code, humans, finished_at"
      )
      .eq("user_id", userId)
      .order("finished_at", { ascending: false })
      .limit(2000),
    poolRatings(),
  ]);

  const matchRows = matches.data ?? [];
  const roundRows = (rounds.data ?? []) as (RoundRow & {
    room_code: string | null;
    humans: number | null;
  })[];

  const onlineMatches = matchRows.filter(againstPeople);
  const soloMatches = matchRows.filter((r) => !againstPeople(r));

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

  const onlineRoundRows = roundRows.filter(againstPeople);

  return {
    rating: ratings.get(userId) ?? null,
    achievements: achievementsFor(
      onlineMatches.map((m) => ({
        won: m.won,
        teamScore: m.team_score,
        opponentScore: m.opponent_score,
        partner: m.partner_name ?? null,
        finishedAt: (m as { finished_at?: string }).finished_at ?? "",
      })),
      onlineRoundRows.map((r) => ({
        won: r.won,
        capicua: r.capicua,
        dominoed: r.dominoed,
        closed: r.closed,
        closedWon: r.closed_won,
        roleAtStart: r.role_at_start,
        pipsLeft: r.pips_left,
        decided: r.decided,
        accuracy: r.accuracy,
        engineAgreement: r.engine_agreement,
        teamPlay: r.team_play,
        teamCalls: r.team_calls ?? undefined,
        keptCabeza: r.kept_cabeza ?? undefined,
        ledThroughout: r.led_throughout ?? undefined,
        partnerPassed: r.partner_passed ?? undefined,
        mistakes: r.mistakes,
        inaccuracies: r.inaccuracies,
        finishedAt: r.finished_at,
      }))
    ),
    online: tally(onlineMatches),
    solo: tally(soloMatches),
    partners: [...byPartner.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.played - a.played),
    onlineRounds: totals(onlineRoundRows),
    soloRounds: totals(roundRows.filter((r) => !againstPeople(r))),
  };
}

/** Everything one account has played, most recent first. */
export async function recordFor(userId: string): Promise<PlayRecord> {
  const db = admin();
  if (!db) return { played: 0, won: 0, lost: 0, recent: [] };

  const { data, error } = await db
    .from("match_results")
    .select("won, team_score, opponent_score, rounds, room_code, partner_name, humans, finished_at")
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
    solo: (r.humans ?? 1) < 2,
    finishedAt: r.finished_at,
  }));

  const won = recent.filter((r) => r.won).length;
  return { played: recent.length, won, lost: recent.length - won, recent };
}
