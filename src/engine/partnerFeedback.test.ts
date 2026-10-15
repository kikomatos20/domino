/**
 * Player feedback about the partner AI, turned into measurements.
 *
 * Each block quotes the report it comes from. They are statistical rather than
 * single positions because the complaints are about tendencies ("always", "every
 * round"), and the payloads attached to them were taken at the start of a round,
 * before the move in question.
 *
 * `it.fails` marks a known problem: the test passes while the AI still does the
 * thing players complained about, and goes red the moment it is fixed — flip it
 * to `it` then, so it guards against the problem coming back.
 */
import { describe, expect, it } from "vitest";
import { applyMove, applyPass, legalMoves, mustPass, newMatch, nextRound, teamOf } from "./engine";
import { chooseMove, forcesBlock, readTable } from "./ai";
import type { Difficulty } from "./ai";
import type { GameState, Seat } from "./types";

function lcg(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

interface Tally {
  rounds: number;
  blocked: number;
  voluntaryCloses: number;
  voluntaryClosesWon: number;
  terceraChoices: number;
  terceraCoveredSalida: number;
}

/** Play `rounds` rounds with all four seats at one level, counting tendencies. */
function simulate(difficulty: Difficulty, rounds: number, seed = 11): Tally {
  const rng = lcg(seed);
  const t: Tally = {
    rounds, blocked: 0, voluntaryCloses: 0, voluntaryClosesWon: 0,
    terceraChoices: 0, terceraCoveredSalida: 0,
  };
  let s: GameState = newMatch(rng);
  for (let n = 0; n < rounds; n++) {
    let closer: Seat | null = null;
    let terceraSeen = false;
    while (!s.roundOver) {
      const seat = s.currentSeat;
      if (mustPass(s, seat)) {
        s = applyPass(s, seat);
        continue;
      }
      const move = chooseMove(s, seat, { difficulty, deterministic: true })!;
      const k = readTable(s, seat);
      const moves = legalMoves(s, seat);

      // A close the player chose: shutting the game with a way to keep it open.
      if (forcesBlock(s, seat, move, k) && moves.some((m) => !forcesBlock(s, seat, m, k))) {
        closer = seat;
      }

      // The opener's partner, on their first move of the round.
      if (!terceraSeen && seat === (((s.opener + 2) % 4) as Seat) && s.line.length > 0) {
        terceraSeen = true;
        const opening = s.line.find((p) => p.opening)!;
        const salida = new Set([opening.left, opening.right]);
        const covers = (m: (typeof moves)[number]) =>
          salida.has((m.end === "left" ? s.leftEnd : s.rightEnd) as number);
        if (moves.some((m) => !covers(m))) {
          t.terceraChoices++;
          if (covers(move)) t.terceraCoveredSalida++;
        }
      }
      s = applyMove(s, seat, move);
    }
    const result = s.roundOver!;
    if (result.kind !== "domino") {
      t.blocked++;
      if (closer !== null) {
        t.voluntaryCloses++;
        if (result.winningTeam === teamOf(closer)) t.voluntaryClosesWon++;
      }
    }
    s = s.matchOver ? newMatch(rng) : nextRound(s, rng);
  }
  return t;
}

const ROUNDS = 800;
const hard = simulate("hard", ROUNDS);
const medium = simulate("medium", ROUNDS);
const pct = (a: number, b: number) => (100 * a) / b;

describe("feedback: 'the computer is now always playing for la tranca' (Kiko, hard)", () => {
  it("hard does not block noticeably more often than medium", () => {
    expect(pct(hard.blocked, ROUNDS)).toBeLessThanOrEqual(pct(medium.blocked, ROUNDS) + 2);
  });

  it("a close hard chooses to make, it wins at least 9 times in 10", () => {
    // "La tranca es una jugada que no se debe hacer para perderla."
    expect(pct(hard.voluntaryClosesWon, hard.voluntaryCloses)).toBeGreaterThanOrEqual(90);
  });
});

describe("feedback: 'mi frente ... le pega a mi salida todas las rondas' (Babo, hard)", () => {
  it.fails("the tercera leaves the opener's suit alone when it has another play", () => {
    // Doctrine the round review already grades humans on: as the tercera,
    // follow your partner's opening suit rather than covering it.
    expect(pct(hard.terceraCoveredSalida, hard.terceraChoices)).toBeLessThanOrEqual(15);
  });
});

it("reports the current numbers", () => {
  const line = (name: string, t: Tally) =>
    `${name}: blocked ${pct(t.blocked, t.rounds).toFixed(1)}% · chosen closes won ` +
    `${pct(t.voluntaryClosesWon, t.voluntaryCloses).toFixed(0)}% of ${t.voluntaryCloses} · ` +
    `tercera covered salida ${pct(t.terceraCoveredSalida, t.terceraChoices).toFixed(0)}%`;
  process.stdout.write(`\n${line("hard", hard)}\n${line("medium", medium)}\n`);
  expect(hard.rounds).toBe(ROUNDS);
});
