/**
 * A rating, in the shape DUPR uses for pickleball doubles.
 *
 * Three things make that system a better fit here than plain Elo:
 *
 *  - It predicts a *score*, not a winner. Matches run to 100, so 100–65 and
 *    100–95 are different results against the same pair, and the rating should
 *    know it.
 *  - Doubles is its native case. A team's strength is the average of its two
 *    players, and afterwards each player moves on their own — which is what
 *    you want when partners rotate every match.
 *  - You can lose and still go up. In a group of four or five who play each
 *    other constantly, win/loss mostly records who got the better partner.
 *
 * Recomputed from the whole history every time rather than stored and updated
 * in place. The same reasoning as the achievements: a constant below can be
 * retuned without a migration, nothing drifts out of step with the matches it
 * came from, and a bug here can corrupt nothing, because there is nothing to
 * corrupt.
 *
 * One honest limit: this only means something inside the pool of people who
 * play each other. It is not comparable to anybody else's number.
 */

export const RATING_FLOOR = 2;
export const RATING_CEILING = 8;
/** Where everybody starts, and what an unknown player counts as. */
export const RATING_START = 3.5;
/** Matches before a rating stops being called provisional. */
export const PROVISIONAL_UNTIL = 10;

/**
 * How far apart two teams must be for the stronger to be a heavy favourite.
 *
 * At a gap of 1.0 the favourite is expected to take about 82% of the points on
 * the table — roughly a 100–22 match. That felt right for dominoes, where luck
 * of the deal keeps even a bad pairing in touch more often than not.
 */
const SPREAD = 1.5;

export interface RatedMatch {
  /** Sorts the history. Matches are replayed in the order they happened. */
  finishedAt: string;
  /** Accounts on each side. Unknown or guest players are simply absent. */
  teamA: string[];
  teamB: string[];
  scoreA: number;
  scoreB: number;
}

export interface Rating {
  rating: number;
  matches: number;
  provisional: boolean;
  /** How the last match moved it, for a "+0.08" next to the number. */
  lastChange: number;
}

/**
 * How much one result is allowed to move you.
 *
 * Wide open at first so a new rating finds its level in a handful of matches,
 * then tightening, so that somebody fifty matches in is not swung about by one
 * bad night. This is what "provisional" actually means — not a label, a
 * different sensitivity.
 */
function step(matchesSoFar: number): number {
  return 0.08 + 0.32 * Math.exp(-matchesSoFar / 6);
}

/** The share of points a team of this strength should take against that one. */
export function expectedShare(team: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - team) / SPREAD));
}

/** Partner dominoes is always two a side. */
const TEAM_SIZE = 2;

/**
 * How strong a side is, counting the seats you cannot see.
 *
 * Averaging only the players you know about would be a real error rather than
 * an approximation: a 5.000 sitting next to a guest would be read as a 5.000
 * team, so the pair would be expected to win handily and the rated player
 * would be punished for a normal result. An unrated seat counts as an average
 * player, which is the same assumption DUPR makes about anybody with no
 * history.
 */
function strengthOf(known: number[]): number {
  const seats = Math.max(TEAM_SIZE, known.length);
  const total =
    known.reduce((a, b) => a + b, 0) + (seats - known.length) * RATING_START;
  return total / seats;
}

function clamp(value: number): number {
  return Math.min(RATING_CEILING, Math.max(RATING_FLOOR, value));
}

/**
 * Replay every match in order and read off where everyone ended up.
 *
 * A match with nobody known on either side teaches nothing and is skipped. A
 * match with one side unknown still counts: the unknown side is taken as an
 * average player, which is the same assumption DUPR makes about someone with
 * no history.
 */
export function ratingsFrom(matches: RatedMatch[]): Map<string, Rating> {
  const ratings = new Map<string, Rating>();
  const get = (id: string): Rating =>
    ratings.get(id) ?? {
      rating: RATING_START,
      matches: 0,
      provisional: true,
      lastChange: 0,
    };

  const inOrder = [...matches].sort((a, b) =>
    a.finishedAt.localeCompare(b.finishedAt)
  );

  for (const m of inOrder) {
    if (m.teamA.length === 0 && m.teamB.length === 0) continue;
    const points = m.scoreA + m.scoreB;
    // A match nobody scored in says nothing about anybody.
    if (points <= 0) continue;

    const strengthA = strengthOf(m.teamA.map((id) => get(id).rating));
    const strengthB = strengthOf(m.teamB.map((id) => get(id).rating));

    const sides: [string[], number, number][] = [
      [m.teamA, m.scoreA / points, expectedShare(strengthA, strengthB)],
      [m.teamB, m.scoreB / points, expectedShare(strengthB, strengthA)],
    ];

    // Everyone on a side is judged against the same expectation, but each
    // moves by their own step — a newcomer partnered with a regular should
    // learn faster than the regular does.
    for (const [team, actual, expected] of sides) {
      for (const id of team) {
        const current = get(id);
        const change = step(current.matches) * (actual - expected);
        const next = clamp(current.rating + change);
        ratings.set(id, {
          rating: next,
          matches: current.matches + 1,
          provisional: current.matches + 1 < PROVISIONAL_UNTIL,
          // The clamp can swallow part of a change at the floor or ceiling;
          // report what actually happened, not what was intended.
          lastChange: next - current.rating,
        });
      }
    }
  }

  return ratings;
}

/** Two decimals is precision this pool cannot support; three is DUPR's own. */
export function formatRating(value: number): string {
  return value.toFixed(3);
}
