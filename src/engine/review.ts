// Post-round review of a player's decisions.
//
// Dominoes by pairs is a team game, so the review is built around the team
// doctrine of Héctor Simosa Alarcón, "El Tigre de Carayaca" (Ciencia y Arte en
// el Dominó), plus the classic partner maxims that follow from it:
//
//   * Every seat has a role relative to the opener (el papel de los jugadores).
//   * The opener's partner exists to keep the opener from passing.
//   * You play with fourteen tiles, not seven — protect your partner, repeat
//     their suit, and never open a suit they have passed on.
//   * The close (la tranca) is a team calculation, not a hunch: count the pips
//     still off the table, halve it, and compare against what you and your
//     partner can be holding. "La tranca es una jugada que no se debe hacer
//     para perderla."
//   * Only wage war on a double when you know where it is and can truly hang it.
//
// Two independent lenses are reported: these principles, and — separately —
// the engine's own search.

import {
  applyMove,
  handPips,
  isDouble,
  legalMoves,
  parseTile,
  stateFromSnapshot,
  teamOf,
  tilePips,
} from "./engine";
import { exposedEnd, readTable, resultingEnds, scoreMoves } from "./ai";
import type { End, GameState, Move, MoveRecord, PlacedTile, Seat, TileId } from "./types";

/** Total pips in a double-six set — the basis of El Tigre's close arithmetic. */
const TOTAL_PIPS = 168;

export type Verdict = "great" | "good" | "inaccuracy" | "mistake";

/** Seat roles, named relative to the opener (el salidor). */
export type Role = "mano" | "segunda" | "tercera" | "pie";

export interface Note {
  kind: "plus" | "minus" | "info";
  text: string;
  /** True when the note is about your side rather than your own tiles. */
  team?: boolean;
}

export interface MoveReview {
  number: number;
  tileId: TileId;
  end: End;
  endsBefore: [number, number] | null;
  choices: number;
  verdict: Verdict;
  headline: string;
  principles: Note[];
  engine: {
    agrees: boolean;
    rank: number;
    total: number;
    bestTileId: TileId;
    bestEnd: End;
    gap: number;
    bestReasons: string[];
  } | null;
}

export interface RoundReview {
  role: Role;
  roleTitle: string;
  roleAdvice: string;
  moves: MoveReview[];
  passes: number;
  engineAgreement: number;
  accuracy: number;
  /** Share of team-related judgements that went your side's way, 0-100. */
  teamPlay: number | null;
  summary: string;
}

const VERDICT_RANK: Record<Verdict, number> = {
  great: 3,
  good: 2,
  inaccuracy: 1,
  mistake: 0,
};

const ROLE_TITLE: Record<Role, string> = {
  mano: "Mano (you opened)",
  segunda: "Segunda (left of the opener)",
  tercera: "Tercera (the opener's partner)",
  pie: "Pie (last to play)",
};

/** Whose lead it is, from the point of view of someone in each role. */
const SEAT_ROLE_OWNER: Record<Role, string> = {
  mano: "you",
  segunda: "the player on your right",
  tercera: "your partner",
  pie: "the player on your left",
};

/** El papel de los jugadores — what each seat is trying to achieve. */
const ROLE_ADVICE: Record<Role, string> = {
  mano: "You opened, so the round is yours to dominate — play for your own hand. Keep a spread of suits so you never have to pass and hand the lead away.",
  segunda: "You sit right after the opener. Your job is to block them, and to stop their partner from squaring the ends or opening the suit they want.",
  tercera: "You are the opener's partner, and your job is to keep them from passing: cover the suits they can't play, leave their suits open, and open their suit when you can.",
  pie: "You play last, so your target is to make the opener pass — square the ends onto suits they may not hold, and never hand them the suit they want.",
};

function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

/**
 * What a move actually does to the table.
 *
 * When both ends show the same suit, playing left or right leaves an identical
 * position — it is one decision, not two, and grading the side you happened to
 * pick would be nonsense. Moves are compared by the position they produce.
 */
function outcomeKey(state: GameState, move: Move): string {
  const [l, r] = resultingEnds(state, move);
  return `${Math.min(l, r)}-${Math.max(l, r)}`;
}

function distinctOutcomes(state: GameState, moves: Move[]): number {
  return new Set(moves.map((m) => outcomeKey(state, m))).size;
}

export function roleOf(seat: Seat, mano: Seat): Role {
  const offset = (seat - mano + 4) % 4;
  return offset === 0 ? "mano" : offset === 1 ? "segunda" : offset === 2 ? "tercera" : "pie";
}

/**
 * Who holds the lead right now.
 *
 * The mano is not fixed for the round. El Tigre is explicit that the roles move
 * as players pass — the lead belongs to whoever has the fewest tiles left, and
 * on equal counts to whoever plays first. So a mano who passes hands the lead
 * to the next player, and everyone's job changes with it.
 */
export function manoAt(hands: readonly string[][], opener: Seat): Seat {
  const counts = hands.map((h) => h.length);
  const fewest = Math.min(...counts);
  for (let i = 0; i < 4; i++) {
    const seat = ((opener + i) % 4) as Seat;
    if (counts[seat] === fewest) return seat;
  }
  return opener;
}

function pipsOnTable(line: PlacedTile[]): number {
  return line.reduce((sum, t) => sum + t.left + t.right, 0);
}

/**
 * El Tigre's close arithmetic.
 *
 * The "cifra-base" is everything still off the table: 168 less the pips already
 * played. Halve it, then weigh it against what your side can be carrying —
 * your own pips plus the heaviest tiles your partner could still plausibly hold
 * (never counting suits they have already passed on). Close only when your side
 * comes in at or under that half.
 */
function closeMath(
  myRemaining: TileId[],
  partnerSeat: Seat,
  partnerTiles: number,
  partnerVoids: Set<number>,
  unseen: TileId[],
  line: PlacedTile[]
) {
  const cifraBase = TOTAL_PIPS - pipsOnTable(line);
  const mine = handPips(myRemaining);

  const plausible = unseen
    .filter((id) => {
      const { a, b } = parseTile(id);
      return !partnerVoids.has(a) && !partnerVoids.has(b);
    })
    .map(tilePips)
    .sort((x, y) => y - x)
    .slice(0, partnerTiles);

  const partnerMax = plausible.reduce((s, v) => s + v, 0);
  const teamMax = mine + partnerMax;
  return {
    cifraBase,
    half: cifraBase / 2,
    mine,
    partnerMax,
    teamMax,
    justified: teamMax <= cifraBase / 2,
    partnerSeat,
  };
}

/** Review every decision `seat` made during a round. */
export function reviewRound(history: MoveRecord[], seat: Seat): RoundReview {
  const opener = history.find((r) => r.kind === "play")?.seat ?? seat;
  // The role you start the round with. It can change hands as people pass.
  const role = roleOf(seat, opener);
  const partner = ((seat + 2) % 4) as Seat;
  const opponents: Seat[] = [nextSeat(seat), ((seat + 3) % 4) as Seat];

  const moves: MoveReview[] = [];
  let passes = 0;
  let number = 0;
  let teamGood = 0;
  let teamBad = 0;
  let sawRoleShift = false;

  for (const rec of history) {
    if (rec.seat !== seat) continue;
    if (rec.kind === "pass") {
      passes++;
      continue;
    }

    number++;
    const state = stateFromSnapshot(rec.before, seat);
    const options = legalMoves(state, seat);
    const played = rec.move!;
    const k = readTable(state, seat);
    const hand = rec.before.hands[seat];
    const remaining = hand.filter((id) => id !== played.tileId);
    const opening = state.line.length === 0;
    const exposed = exposedEnd(state, played);
    const { a } = parseTile(played.tileId);
    // Did this tile shut the game (a tranca) rather than just continue it?
    const closedBy = opening ? null : applyMove(state, seat, played).roundOver;
    const closesRound = !!closedBy && closedBy.kind !== "domino";

    // Who leads at this moment, and therefore what your job is right now.
    const mano = manoAt(rec.before.hands, opener);
    const roleNow = roleOf(seat, mano);

    const principles: Note[] = [];
    let credit = 0;
    // The mano plays their own hand, so team duties are not scored in that seat.
    const scoresTeam = roleNow !== "mano";
    const team = (n: Note, delta: number) => {
      principles.push({ ...n, team: true });
      credit += delta;
      if (!scoresTeam) return;
      if (delta > 0) teamGood++;
      else if (delta < 0) teamBad++;
    };
    const solo = (n: Note, delta: number) => {
      principles.push(n);
      credit += delta;
    };

    // Say so when the lead has moved — your duties moved with it. Kept aside so
    // it survives even on a forced move, where the rest of the notes are
    // cleared: whose lead it is stays worth knowing.
    let roleNote: Note | null = null;
    if (roleNow !== role) {
      sawRoleShift = true;
      roleNote = {
        kind: "info",
        team: true,
        text:
          roleNow === "mano"
            ? `The lead has come to you — you hold the fewest tiles, so you are the mano now and play your own hand.`
            : `The lead has moved to ${SEAT_ROLE_OWNER[roleNow]}; you are the ${roleNow} for this move.`,
      };
      principles.push(roleNote);
    }

    if (opening) {
      judgeOpening(played.tileId, hand, k, solo, (n, d) => team(n, d));
    } else {
      // --- your own tiles ---
      const playableDoubles = options
        .map((m) => m.tileId)
        .filter((id) => isDouble(id) && id !== played.tileId);
      if (playableDoubles.length > 0 && !isDouble(played.tileId)) {
        solo(
          {
            kind: "minus",
            text: `The ${playableDoubles[0]} was playable and stayed in your hand. Play doubles at the first chance — and it tells your partner you no longer hold it.`,
          },
          -1
        );
      } else if (isDouble(played.tileId)) {
        solo({ kind: "plus", text: `Cleared the ${played.tileId} while it fitted.` }, 1);
      }

      // "La minga": a tile whose two suits you hold nothing else of.
      const before = k.suitCount;
      const { a: ta, b: tb } = parseTile(played.tileId);
      if (ta !== tb && before[ta] === 1 && before[tb] === 1 && hand.length >= 5) {
        solo(
          {
            kind: "minus",
            text: `That was your only ${ta} and your only ${tb} ("la minga") — playing it this early leaves you void in two suits at once.`,
          },
          -1
        );
      }

      if (exposed !== null) {
        // What the ends were before, and what they are now. A double keeps the
        // suit it is played on, so it opens nothing new.
        const endBefore = played.end === "left" ? rec.before.leftEnd! : rec.before.rightEnd!;
        const otherEnd = played.end === "left" ? rec.before.rightEnd! : rec.before.leftEnd!;
        const changedTheSuit = exposed !== endBefore;
        const partnerVoids = k.voids[partner];
        const partnerStuckBefore =
          partnerVoids.has(endBefore) && partnerVoids.has(otherEnd);
        const partnerStuckAfter = partnerVoids.has(exposed) && partnerVoids.has(otherEnd);

        // Do you own this suit? If none of it is unaccounted for, nobody else
        // can answer that end — opening it is a squeeze you have set up, not a
        // gift, and none of the usual warnings apply.
        const unseenOfSuit = k.unseenSuit[exposed];
        const youControl = unseenOfSuit === 0;
        const youDominate = k.suitCount[exposed] > unseenOfSuit;

        if (youControl && changedTheSuit) {
          solo(
            {
              kind: "plus",
              text: `Every remaining ${exposed} is in your hand, so that end is yours alone — nobody else can answer it.`,
            },
            2
          );
        } else if (youDominate && changedTheSuit) {
          principles.push({
            kind: "info",
            text: `You hold more ${exposed}s (${k.suitCount[exposed]}) than are unaccounted for (${unseenOfSuit}), so you keep the upper hand on that end.`,
          });
        }

        // --- your partner ---
        // Your partner only needs one end. Shutting them out means closing the
        // last door they had, not merely leaving a suit they cannot use.
        if (partnerStuckAfter && !partnerStuckBefore && !youControl) {
          if (roleNow === "mano") {
            // The mano plays their own game first — El Tigre is explicit about
            // it — so this is worth knowing, not a fault.
            principles.push({
              kind: "info",
              team: true,
              text: `This leaves your partner stuck on both ends. As the mano you play your own hand first, so that can be the right price — just know you are paying it.`,
            });
          } else {
            team(
              {
                kind: "minus",
                text: `That closed the last end your partner could use — both ${exposed}s and ${otherEnd}s are suits they have passed on, so they must pass again. You are playing fourteen tiles, not seven.`,
              },
              -2
            );
          }
        } else if (partnerVoids.has(exposed) && !partnerStuckAfter) {
          principles.push({
            kind: "info",
            team: true,
            text: `Your partner has passed on ${exposed}s, but the ${otherEnd} end is still open to them, so this does not shut them out.`,
          });
        } else if (partnerStuckBefore) {
          principles.push({
            kind: "info",
            team: true,
            text: `Your partner was already stuck on both ends before this. Once a player passes the roles shift — the lead is effectively yours now, so playing your own game here is right.`,
          });
        }

        const partnerSuits = suitsPlayedBy(rec.before.line, partner);
        if (partnerSuits.has(exposed) && !k.voids[partner].has(exposed)) {
          team(
            {
              kind: "plus",
              text: `Kept the ${exposed} open — a suit your partner has been playing. Repeat your partner's suit whenever you can.`,
            },
            1
          );
        }

        if (roleNow === "tercera" && !youControl) {
          const openerSuits = suitsPlayedBy(rec.before.line, mano);
          const couldRepeat = options.some((m) => {
            const t = parseTile(m.tileId);
            return openerSuits.has(t.a) || openerSuits.has(t.b);
          });
          const didRepeat = openerSuits.has(ta) || openerSuits.has(tb);
          if (didRepeat) {
            team(
              {
                kind: "plus",
                text: `As the opener's partner you followed their suit. That is your first duty in this seat — keep the mano alive.`,
              },
              1
            );
          } else if (couldRepeat) {
            team(
              {
                kind: "minus",
                text: `You could have followed your partner's opening suit and played elsewhere instead. In the tercera seat your job is to keep the mano from passing.`,
              },
              -1
            );
          }
        }

        // --- the opponents ---
        // If the move actually shut the game, the close arithmetic below judges
        // it — crediting the squeeze as well would double-count the same idea.
        const squeezed = closesRound ? [] : opponents.filter((o) => k.voids[o].has(exposed));
        if (squeezed.length) {
          team(
            {
              kind: "plus",
              text: `Left a ${exposed} that ${squeezed.length === 2 ? "both opponents have" : "an opponent has"} passed on — punishing their suits is the best defence.`,
            },
            2
          );
        }

        const rightOpponent = opponents[0];
        const theirSuits = suitsPlayedBy(rec.before.line, rightOpponent, 2);
        // Only a tile that changes the suit can hand them anything; a double
        // leaves the end exactly as it already was. And a suit you control is
        // not a gift to anyone.
        if (
          changedTheSuit &&
          !youControl &&
          !youDominate &&
          theirSuits.has(exposed) &&
          !k.voids[rightOpponent].has(exposed)
        ) {
          team(
            {
              kind: "minus",
              text: `You opened a ${exposed} for the opponent on your right, who has been developing that suit. Cover their suit rather than open it.`,
            },
            -1
          );
        }

        // A brand-new suit opens the game up for everyone.
        const fresh = changedTheSuit && !suitOnTable(rec.before.line, exposed);
        if (fresh && k.suitCount[exposed] <= 1 && !partnerSuits.has(exposed)) {
          solo(
            {
              kind: "minus",
              text: `That opened the ${exposed}s, a suit nobody had touched, and you hold no more of them. A fresh suit widens the game for the opponents too.`,
            },
            -1
          );
        }

        const answers = k.suitCount[exposed] - (isDouble(played.tileId) ? 1 : 0);
        if (answers >= 2) {
          solo(
            {
              kind: "plus",
              text: `You still hold ${answers} more ${exposed}s, so you keep control of that end.`,
            },
            1
          );
        }

        // Hanging a double: only worth chasing when you know where it is.
        if (k.outstandingDoubles.has(exposed) && k.unseenSuit[exposed] <= 2) {
          principles.push({
            kind: "info",
            team: true,
            text: `The ${exposed}-${exposed} is still unplayed with only ${k.unseenSuit[exposed]} ${exposed}s unaccounted for — worth chasing, but only wage war on a double when you are sure you can hang it.`,
          });
        }
      }

      judgeClose(
        state,
        seat,
        partner,
        played,
        options,
        remaining,
        k,
        team,
        principles
      );
    }

    // Lens 2: the engine's own ranking — of positions, not of which side of the
    // table you happened to drop the tile on.
    const outcomes = distinctOutcomes(state, options);
    let engine: MoveReview["engine"] = null;
    if (outcomes > 1) {
      const scored = scoreMoves(state, seat, { difficulty: "hard", deterministic: true });
      // Collapse moves that leave the same position, keeping the best score.
      const byOutcome = new Map<string, (typeof scored)[number]>();
      for (const entry of scored) {
        const key = outcomeKey(state, entry.move);
        const seen = byOutcome.get(key);
        if (!seen || entry.score > seen.score) byOutcome.set(key, entry);
      }
      const ranked = [...byOutcome.values()].sort((x, y) => y.score - x.score);
      const best = ranked[0];
      const myKey = outcomeKey(state, played);
      const mineIdx = ranked.findIndex((r) => outcomeKey(state, r.move) === myKey);
      const mine = ranked[mineIdx];
      engine = {
        agrees: mineIdx === 0,
        rank: mineIdx + 1,
        total: ranked.length,
        bestTileId: best.move.tileId,
        bestEnd: best.move.end,
        gap: Math.round((best.score - (mine?.score ?? best.score)) * 10) / 10,
        bestReasons: best.reasons,
      };
    }

    let verdict: Verdict;
    if (credit >= 2) verdict = "great";
    else if (credit >= -1) verdict = "good";
    else if (credit === -2) verdict = "inaccuracy";
    else verdict = "mistake";

    // If the engine would have played it too, it is not an error. This stops a
    // single soft principle from branding a perfectly good move.
    if (engine?.agrees && verdict !== "great") verdict = "good";

    if (outcomes === 1) {
      verdict = "good";
      principles.length = 0;
      if (roleNote) principles.push(roleNote);
      principles.push({
        kind: "info",
        text:
          options.length === 1
            ? "Only one legal move — nothing to decide."
            : "Both ends were the same, so either side left the identical position — nothing to decide.",
      });
    }

    moves.push({
      number,
      tileId: played.tileId,
      end: played.end,
      endsBefore:
        rec.before.leftEnd === null || rec.before.rightEnd === null
          ? null
          : [rec.before.leftEnd, rec.before.rightEnd],
      // Real decisions, not legal moves: two ends showing the same suit are one.
      choices: outcomes,
      verdict,
      headline: headlineFor(verdict, played.tileId),
      principles,
      engine,
    });
  }

  const decided = moves.filter((m) => m.choices > 1);
  const engineAgreement = decided.filter((m) => m.engine?.agrees).length;
  const accuracy = decided.length
    ? Math.round(
        (decided.reduce((s, m) => s + VERDICT_RANK[m.verdict], 0) / (decided.length * 3)) * 100
      )
    : 100;
  // Moves made while holding the lead are excluded above, so if nothing is left
  // to score, this player was the mano throughout and there is no team score to
  // give — reporting one would nag them for doing the right thing.
  const teamTotal = teamGood + teamBad;
  const teamPlay = teamTotal ? Math.round((teamGood / teamTotal) * 100) : null;

  return {
    role,
    roleTitle: ROLE_TITLE[role],
    roleAdvice:
      ROLE_ADVICE[role] +
      (sawRoleShift
        ? " The lead changed hands during the round, so your job changed with it — each move below is judged by the role you held at the time."
        : ""),
    moves,
    passes,
    engineAgreement,
    accuracy,
    teamPlay,
    summary: summarize(moves, decided.length, engineAgreement, accuracy, passes, teamPlay, role),
  };
}

/** Which suits a given seat has put on the table. */
function suitsPlayedBy(line: PlacedTile[], seat: Seat, min = 1): Set<number> {
  const counts = new Map<number, number>();
  for (const t of line) {
    if (t.seat !== seat) continue;
    for (const v of new Set([t.left, t.right])) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, n]) => n >= min).map(([v]) => v));
}

function suitOnTable(line: PlacedTile[], suit: number): boolean {
  return line.some((t) => t.left === suit || t.right === suit);
}

function judgeOpening(
  tileId: TileId,
  hand: TileId[],
  k: ReturnType<typeof readTable>,
  solo: (n: Note, d: number) => void,
  team: (n: Note, d: number) => void
) {
  const { a } = parseTile(tileId);
  const doubles = hand.filter(isDouble);

  if (isDouble(tileId)) {
    const company = k.suitCount[a] - 1;
    team(
      {
        kind: "plus",
        text: company
          ? `Led the ${a}-${a} with ${company} more ${a}${company > 1 ? "s" : ""} behind it — the regla de oro opening, and it tells your partner exactly which suit to follow.`
          : `Led a bare ${a}-${a} ("en pelo"): it clears your hardest tile and names a suit for your partner, but leaves you void in ${a}s.`,
      },
      1
    );
    const better = doubles.filter(
      (d) => tilePips(d) > tilePips(tileId) && k.suitCount[parseTile(d).a] > 1
    );
    if (better.length) {
      solo(
        {
          kind: "minus",
          text: `You also held the ${better[0]} with company — the higher accompanied double is the stronger lead.`,
        },
        -1
      );
    }
  } else if (doubles.length > 0) {
    solo(
      {
        kind: "minus",
        text: `You held ${doubles.join(", ")} but opened with a mixed tile. Doubles are hardest to place, and leading one names your suit for your partner.`,
      },
      -1
    );
  } else {
    team(
      {
        kind: "plus",
        text: "No doubles in hand, so a mixed lead is right — and it tells your partner you hold none (salida mata-doble), so they can hunt the doubles with you.",
      },
      1
    );
  }
}

/**
 * The close, judged by El Tigre's own count rather than by hindsight.
 */
function judgeClose(
  state: ReturnType<typeof stateFromSnapshot>,
  seat: Seat,
  partner: Seat,
  played: Move,
  options: Move[],
  remaining: TileId[],
  k: ReturnType<typeof readTable>,
  team: (n: Note, d: number) => void,
  principles: Note[]
) {
  const myTeam = teamOf(seat);
  const partnerTiles = state.hands[partner].length;

  const outcomeOf = (m: Move) => {
    const after = applyMove(state, seat, m);
    return after.roundOver;
  };

  const playedOutcome = outcomeOf(played);

  // Did this move slam the door?
  if (playedOutcome && playedOutcome.kind !== "domino") {
    const after = applyMove(state, seat, played);
    const real = closeMath(
      remaining,
      partner,
      partnerTiles,
      k.voids[partner],
      k.unseen,
      after.line
    );

    const won = playedOutcome.winningTeam === myTeam;
    if (won) {
      team(
        {
          kind: "plus",
          text: `You closed the game and won it, ${playedOutcome.points} points. Your count: ${real.mine} in hand plus at most ${real.partnerMax} with your partner against half the cifra-base (${real.half.toFixed(0)} of ${real.cifraBase}).`,
        },
        2
      );
    } else if (playedOutcome.kind === "tie") {
      team(
        {
          kind: "info",
          text: `Your close ended dead level, so nobody scored. El Tigre: discard the uncertain trancas.`,
        },
        0
      );
    } else {
      team(
        {
          kind: "minus",
          text: `You closed the game and lost it, handing over ${playedOutcome.points} points. "La tranca es una jugada que no se debe hacer para perderla" — count your side first: ${real.mine} in your hand plus up to ${real.partnerMax} with your partner, against half the cifra-base (${real.half.toFixed(0)}).`,
        },
        -3
      );
    }
    return;
  }

  // Was there a close on offer that you passed up?
  for (const option of options) {
    if (option.tileId === played.tileId && option.end === played.end) continue;
    const outcome = outcomeOf(option);
    if (!outcome || outcome.kind === "domino") continue;
    if (outcome.winningTeam !== myTeam) continue;

    const after = applyMove(state, seat, option);
    const rest = remaining.concat(played.tileId).filter((id) => id !== option.tileId);
    const math = closeMath(rest, partner, partnerTiles, k.voids[partner], k.unseen, after.line);
    if (math.justified) {
      team(
        {
          kind: "minus",
          text: `${option.tileId} would have closed the game for ${outcome.points} points, and the count backed it: ${math.mine} in your hand plus at most ${math.partnerMax} with your partner against half the cifra-base (${math.half.toFixed(0)}).`,
        },
        -2
      );
    } else {
      principles.push({
        kind: "info",
        team: true,
        text: `${option.tileId} would have closed the game and happened to win, but the count did not support it (your side up to ${math.teamMax} against a half cifra-base of ${math.half.toFixed(0)}) — that is a tranca to discard, not a mistake to regret.`,
      });
    }
    return;
  }
}

function headlineFor(verdict: Verdict, tileId: TileId): string {
  const t = tileId.replace("-", "|");
  if (verdict === "great") return `${t} — strong choice`;
  if (verdict === "good") return `${t} — sound`;
  if (verdict === "inaccuracy") return `${t} — inaccuracy`;
  return `${t} — mistake`;
}

function summarize(
  moves: MoveReview[],
  decided: number,
  agreement: number,
  accuracy: number,
  passes: number,
  teamPlay: number | null,
  role: Role
): string {
  if (moves.length === 0) return "You never got to place a tile this round.";

  const mistakes = moves.filter((m) => m.verdict === "mistake").length;
  const inaccuracies = moves.filter((m) => m.verdict === "inaccuracy").length;

  const parts: string[] = [];
  if (mistakes === 0 && inaccuracies === 0) {
    parts.push("Clean round — no clear errors.");
  } else {
    const bits: string[] = [];
    if (mistakes) bits.push(`${mistakes} mistake${mistakes > 1 ? "s" : ""}`);
    if (inaccuracies) bits.push(`${inaccuracies} inaccurac${inaccuracies > 1 ? "ies" : "y"}`);
    parts.push(`${bits.join(" and ")} out of ${moves.length} plays.`);
  }
  if (teamPlay !== null) {
    parts.push(
      `Team play ${teamPlay}% — that is how often your choices helped your side rather than the opponents.`
    );
  } else if (role === "mano") {
    parts.push("You held the lead, so you were playing your own hand — no team score this round.");
  }
  if (decided > 0) {
    parts.push(`You matched the engine's first choice ${agreement} of ${decided} times.`);
  }
  if (passes > 0) parts.push(`You passed ${passes} time${passes > 1 ? "s" : ""}.`);
  parts.push(`Accuracy ${accuracy}%.`);
  return parts.join(" ");
}
