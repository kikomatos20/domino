/**
 * Things worth having done.
 *
 * Derived from the rows already stored rather than written down when they
 * happen. That means they apply to play that came before they existed, a
 * threshold can be retuned without a migration, and a mistake here can never
 * corrupt anything — it is a pure reading of history.
 *
 * Two rules shaped the list. Nothing rewards volume, because playing a lot
 * measures free time rather than dominoes. And nothing rewards an action the
 * engine would call a mistake — an achievement for closing trancas would teach
 * exactly the habit El Tigre warns against.
 *
 * Only games against people count. A table you filled with computers is
 * practice, and practice you can repeat until it pays out is not an
 * achievement.
 */

export interface AchievementMatch {
  won: boolean;
  teamScore: number;
  opponentScore: number;
  partner: string | null;
  finishedAt: string;
}

export interface AchievementRound {
  won: boolean;
  capicua: boolean;
  dominoed: boolean;
  closed: boolean;
  closedWon: boolean;
  roleAtStart: string | null;
  pipsLeft: number;
  decided: number;
  accuracy: number | null;
  engineAgreement: number | null;
  teamPlay: number | null;
  /** How many team judgements the round actually put to you. */
  teamCalls?: number;
  /** Times you held your cabeza back while the round was yours to finish. */
  keptCabeza?: number;
  /** You were the mano at every tile you played. */
  ledThroughout?: boolean;
  /** Your partner passed during the round. */
  partnerPassed?: boolean;
  mistakes: number;
  inaccuracies: number;
  finishedAt: string;
}

export interface Achievement {
  id: string;
  name: string;
  note: string;
  /** When it was first earned, or null. */
  earnedAt: string | null;
  /** For the ones you can be part-way through. */
  progress?: { have: number; need: number };
  /**
   * Which rung of a tiered achievement you have reached, if any.
   *
   * `level` is 0 until the first rung is earned. `label` names the rung you
   * are on now and `key` is its lowercase form, so the interface can colour a
   * badge without knowing anything about the thresholds behind it.
   */
  tier?: {
    level: number;
    levels: number;
    label: string;
    key: RungKey;
    times: number;
    /** Nothing above this one. */
    top: boolean;
  };
}

export type RungKey = "none" | "bronze" | "silver" | "gold" | "platinum";

/**
 * The four rungs.
 *
 * Bronze, silver and gold are a steady climb — roughly three times the last.
 * Platinum is deliberately not: it is several times gold again, so that it
 * means somebody has been doing this for a long while rather than having had
 * a good week. A ladder whose top rung is reachable by the third session is
 * not a ladder.
 */
const RUNGS = ["Bronze", "Silver", "Gold", "Platinum"] as const;
const RUNG_KEYS: RungKey[] = ["bronze", "silver", "gold", "platinum"];

/**
 * An achievement you can do more than once.
 *
 * Counts the dates it happened, oldest first, and reads three rungs off them.
 * `earnedAt` stays the first time, so the list can still be sorted by when you
 * first got there; the rung is what changes as it happens again.
 *
 * Thresholds live here and nowhere else — these are derived at read time, so
 * retuning one costs a deploy rather than a migration, and a player's history
 * is re-read against the new numbers rather than being stuck on the old ones.
 */
function tiered(
  id: string,
  name: string,
  note: string,
  dates: string[],
  steps: readonly [number, number, number, number]
): Achievement {
  const when = [...dates].sort();
  const times = when.length;
  const level = steps.filter((s) => times >= s).length;
  // Progress runs toward the next rung, or sits full once platinum is reached.
  const need = level < steps.length ? steps[level] : steps[steps.length - 1];

  return {
    id,
    name,
    note,
    earnedAt: times >= steps[0] ? when[steps[0] - 1] : null,
    progress: { have: Math.min(times, need), need },
    tier: {
      level,
      levels: steps.length,
      label: level > 0 ? RUNGS[level - 1] : "",
      key: level > 0 ? RUNG_KEYS[level - 1] : "none",
      times,
      top: level === steps.length,
    },
  };
}

/** When each round matching a test finished. */
function roundDates(
  rounds: AchievementRound[],
  test: (r: AchievementRound) => boolean
): string[] {
  return rounds.filter(test).map((r) => r.finishedAt);
}

function matchDates(
  matches: AchievementMatch[],
  test: (m: AchievementMatch) => boolean
): string[] {
  return matches.filter(test).map((m) => m.finishedAt);
}

function firstMatch(
  matches: AchievementMatch[],
  test: (m: AchievementMatch) => boolean
): string | null {
  const hits = matches.filter(test).map((m) => m.finishedAt).sort();
  return hits[0] ?? null;
}

/** Longest run of wins, oldest first, and when it completed. */
function bestRun(matches: AchievementMatch[], need: number) {
  const inOrder = [...matches].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  let run = 0;
  let best = 0;
  let earnedAt: string | null = null;
  for (const m of inOrder) {
    run = m.won ? run + 1 : 0;
    if (run > best) best = run;
    if (run === need && !earnedAt) earnedAt = m.finishedAt;
  }
  return { earnedAt, have: Math.min(best, need) };
}

/** Wins with each named partner. Computers are not partners. */
function partnerWins(matches: AchievementMatch[]) {
  const counts = new Map<string, string[]>();
  for (const m of matches) {
    if (!m.won || !m.partner || m.partner.startsWith("Computer")) continue;
    counts.set(m.partner, [...(counts.get(m.partner) ?? []), m.finishedAt]);
  }
  let best = { name: "", dates: [] as string[] };
  for (const [name, dates] of counts) {
    if (dates.length > best.dates.length) best = { name, dates: [...dates].sort() };
  }
  return best;
}

export function achievementsFor(
  matches: AchievementMatch[],
  rounds: AchievementRound[]
): Achievement[] {
  const trio = bestRun(matches, 3);
  const partner = partnerWins(matches);

  return [
    {
      id: "first-win",
      name: "On the board",
      note: "Win a match against people.",
      earnedAt: firstMatch(matches, (m) => m.won),
    },
    tiered(
      "dominoed",
      "Dominoed",
      "Win a round by playing your last tile.",
      roundDates(rounds, (r) => r.dominoed),
      [1, 15, 50, 150]
    ),
    tiered(
      "capicua",
      "Capicúa",
      "Go out on a tile that fitted both ends.",
      roundDates(rounds, (r) => r.capicua),
      [1, 5, 15, 40]
    ),
    tiered(
      "tranca",
      "La tranca",
      "Shut the game and win it — counted before you closed, not after.",
      roundDates(rounds, (r) => r.closed && r.closedWon),
      [1, 8, 25, 70]
    ),
    tiered(
      "pie",
      "Last shall be first",
      "Win a round from the pie, playing last all the way round.",
      roundDates(rounds, (r) => r.won && r.roleAtStart === "pie"),
      [1, 10, 30, 90]
    ),

    /*
     * The cabeza. Rare on purpose: it needs a suit to be exactly exhausted
     * while the round is yours to finish, and then it needs you to leave the
     * tile alone. Doing it once is luck noticing you; doing it often is the
     * habit Kiko described.
     */
    tiered(
      "cabeza",
      "Held the cabeza",
      "Keep the last tile of a dead suit in hand while the round is yours to finish.",
      roundDates(rounds, (r) => (r.keptCabeza ?? 0) > 0),
      [1, 5, 15, 40]
    ),

    /*
     * Your partner passes and the round lands on you. Winning from there is a
     * different thing from winning a round that went to plan, and until now
     * the stats could not tell them apart.
     */
    tiered(
      "carried",
      "Carried it",
      "Win a round after your partner has passed.",
      roundDates(rounds, (r) => r.won && r.partnerPassed === true),
      [1, 10, 30, 90]
    ),

    /* Opened, never passed, never fell behind on tiles, and won. */
    tiered(
      "wire-to-wire",
      "Wire to wire",
      "Win a round having held the lead at every tile you played.",
      roundDates(rounds, (r) => r.won && r.ledThroughout === true),
      [1, 8, 25, 70]
    ),

    /*
     * Retuned against real play, not intuition.
     *
     * "No mistakes and no inaccuracies" turned out to fire on 73% of recorded
     * rounds — the review's verdicts are generous, so the absence of a bad one
     * says almost nothing. Asking for every graded move to be the best one
     * available lands at about 5%, which is what an achievement should feel
     * like. Separate from In step, which asks about the engine's ranking
     * rather than the verdict.
     */
    tiered(
      "clean",
      "Clean hand",
      "A round of real decisions where every single one was the best move going.",
      roundDates(rounds, (r) => r.decided >= 3 && r.accuracy === 100),
      [1, 10, 30, 90]
    ),
    tiered(
      "sharp",
      "Sharp",
      "A round at 90% accuracy or better.",
      roundDates(rounds, (r) => (r.accuracy ?? 0) >= 90 && r.decided >= 3),
      [1, 15, 50, 150]
    ),
    tiered(
      "in-step",
      "In step",
      "Match the engine's first choice on every decision in a round.",
      roundDates(rounds, (r) => r.decided >= 3 && r.engineAgreement === 100),
      [1, 10, 30, 90]
    ),

    /*
     * Retuned: this used to fire on any round where teamPlay was 100, which
     * included rounds that put a single team decision to you. A percentage
     * with a denominator of one is not a round of team play.
     */
    tiered(
      "fourteen-tiles",
      "Fourteen tiles",
      "A round of at least four team decisions where every one went your partner's way.",
      roundDates(rounds, (r) => r.teamPlay === 100 && (r.teamCalls ?? 0) >= 4),
      [1, 8, 25, 70]
    ),

    tiered(
      "runaway",
      "Runaway",
      "Win a match by fifty or more.",
      matchDates(matches, (m) => m.won && m.teamScore - m.opponentScore >= 50),
      [1, 5, 15, 40]
    ),
    {
      id: "hat-trick",
      name: "Three in a row",
      note: "Win three matches back to back.",
      earnedAt: trio.earnedAt,
      progress: { have: trio.have, need: 3 },
    },
    {
      id: "partnership",
      name: partner.name ? `Regulars with ${partner.name}` : "Regulars",
      note: "Win five matches with the same partner.",
      earnedAt: partner.dates.length >= 5 ? partner.dates[4] : null,
      progress: { have: Math.min(partner.dates.length, 5), need: 5 },
    },
  ];
}

/**
 * Which achievements a single finished round would qualify for.
 *
 * Deliberately separate from `achievementsFor`, which needs your whole history.
 * A table can run this on the round it just watched, with no request and no
 * knowledge of anything else — the caller supplies what has already been
 * earned, so nothing announces itself twice.
 *
 * Only covers the round-shaped ones. Match achievements are settled when a
 * match ends, by which point the page has fetched fresh totals anyway.
 */
export function earnedInRound(
  round: Omit<AchievementRound, "finishedAt">,
  already: ReadonlySet<string>
): { id: string; name: string }[] {
  const qualifies: { id: string; name: string }[] = [];
  const add = (id: string, name: string, won: boolean) => {
    if (won && !already.has(id)) qualifies.push({ id, name });
  };

  add("dominoed", "Dominoed", round.dominoed);
  add("capicua", "Capicúa", round.capicua);
  add("tranca", "La tranca", round.closed && round.closedWon);
  add("pie", "Last shall be first", round.won && round.roleAtStart === "pie");
  add("cabeza", "Held the cabeza", (round.keptCabeza ?? 0) > 0);
  add("carried", "Carried it", round.won && round.partnerPassed === true);
  add("wire-to-wire", "Wire to wire", round.won && round.ledThroughout === true);
  add("clean", "Clean hand", round.decided >= 3 && round.accuracy === 100);
  add("sharp", "Sharp", (round.accuracy ?? 0) >= 90 && round.decided >= 3);
  add("in-step", "In step", round.decided >= 3 && round.engineAgreement === 100);
  add(
    "fourteen-tiles",
    "Fourteen tiles",
    round.teamPlay === 100 && (round.teamCalls ?? 0) >= 4
  );

  return qualifies;
}

/** The nearest one not yet earned, for a "next up" line. */
export function nextUp(list: Achievement[]): Achievement | null {
  const open = list.filter((a) => !a.earnedAt);
  if (open.length === 0) return null;
  // Something part-way through beats something not started.
  const started = open
    .filter((a) => a.progress && a.progress.have > 0)
    .sort(
      (a, b) =>
        b.progress!.have / b.progress!.need - a.progress!.have / a.progress!.need
    );
  return started[0] ?? open[0];
}
