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
}

/** The earliest round matching a test, or null. */
function firstRound(
  rounds: AchievementRound[],
  test: (r: AchievementRound) => boolean
): string | null {
  const hits = rounds.filter(test).map((r) => r.finishedAt).sort();
  return hits[0] ?? null;
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
    {
      id: "dominoed",
      name: "Dominoed",
      note: "Win a round by playing your last tile.",
      earnedAt: firstRound(rounds, (r) => r.dominoed),
    },
    {
      id: "capicua",
      name: "Capicúa",
      note: "Go out on a tile that fitted both ends.",
      earnedAt: firstRound(rounds, (r) => r.capicua),
    },
    {
      id: "tranca",
      name: "La tranca",
      note: "Shut the game and win it — counted before you closed, not after.",
      earnedAt: firstRound(rounds, (r) => r.closed && r.closedWon),
    },
    {
      id: "pie",
      name: "Last shall be first",
      note: "Win a round from the pie, playing last all the way round.",
      earnedAt: firstRound(rounds, (r) => r.won && r.roleAtStart === "pie"),
    },
    {
      id: "clean",
      name: "Clean hand",
      note: "A round with no mistakes and no inaccuracies, with real decisions in it.",
      earnedAt: firstRound(
        rounds,
        (r) => r.decided >= 3 && r.mistakes === 0 && r.inaccuracies === 0
      ),
    },
    {
      id: "sharp",
      name: "Sharp",
      note: "A round at 90% accuracy or better.",
      earnedAt: firstRound(rounds, (r) => (r.accuracy ?? 0) >= 90),
    },
    {
      id: "in-step",
      name: "In step",
      note: "Match the engine's first choice on every decision in a round.",
      earnedAt: firstRound(rounds, (r) => r.decided >= 3 && r.engineAgreement === 100),
    },
    {
      id: "fourteen-tiles",
      name: "Fourteen tiles",
      note: "A round where every team judgement went your partner's way.",
      earnedAt: firstRound(rounds, (r) => r.teamPlay === 100),
    },
    {
      id: "light",
      name: "Nearly out",
      note: "Lose a round holding three pips or fewer — you were one tile away.",
      earnedAt: firstRound(rounds, (r) => !r.won && r.pipsLeft <= 3),
    },
    {
      id: "runaway",
      name: "Runaway",
      note: "Win a match by fifty or more.",
      earnedAt: firstMatch(matches, (m) => m.won && m.teamScore - m.opponentScore >= 50),
    },
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
