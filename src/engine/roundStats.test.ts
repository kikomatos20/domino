import { describe, expect, it } from "vitest";
import { applyMove, applyPass, newMatch } from "./engine";
import { chooseMove } from "./ai";
import { statsFor } from "./roundStats";
import type { GameState, Seat } from "./types";

/** Play one round to the finish with a repeatable deal. */
function playRound(seed: number): GameState {
  let s = seed >>> 0;
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0x100000000);
  let state = newMatch(rng);
  let guard = 0;
  while (!state.roundOver && guard++ < 80) {
    const seat = state.currentSeat;
    const move = chooseMove(state, seat, { difficulty: "medium", deterministic: true });
    state = move ? applyMove(state, seat, move) : applyPass(state, seat);
  }
  return state;
}

describe("what gets written down about a round", () => {
  it("says nothing at all about a round still in progress", () => {
    expect(statsFor(newMatch(() => 0.5), 0)).toBeNull();
  });

  it("agrees with the round result it is describing", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = playRound(seed * 7919);
      const over = state.roundOver!;

      for (const seat of [0, 1, 2, 3] as Seat[]) {
        const stat = statsFor(state, seat)!;

        expect(stat.won).toBe(over.winningTeam === seat % 2);
        expect(stat.pipsLeft).toBe(over.pips[seat]);
        expect(stat.kind).toBe(over.kind);

        // Only the player who actually went out is credited with it.
        expect(stat.dominoed).toBe(over.kind === "domino" && over.winnerSeat === seat);
        // And a capicua is a kind of going out, never separate from it.
        if (stat.capicua) expect(stat.dominoed).toBe(true);
        // Closing and dominoing are different ways for a round to end.
        if (stat.closed) expect(stat.dominoed).toBe(false);
        if (stat.closedWon) expect(stat.closed).toBe(true);
      }
    }
  });

  it("counts each player's own passes and nobody else's", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = playRound(seed * 104729);
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        const mine = state.history.filter((r) => r.seat === seat && r.kind === "pass").length;
        expect(statsFor(state, seat)!.passes).toBe(mine);
      }
    }
  });

  it("keeps percentages inside the range a percentage has", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = playRound(seed * 15485863);
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        const stat = statsFor(state, seat)!;
        for (const value of [stat.accuracy, stat.engineAgreement, stat.teamPlay]) {
          if (value === null) continue;
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        }
        // Nothing can be graded that was never a real decision.
        expect(stat.decided).toBeLessThanOrEqual(stat.moves);
        expect(stat.mistakes + stat.inaccuracies).toBeLessThanOrEqual(stat.moves);
      }
    }
  });

  it("leaves accuracy unset when there was nothing to decide", () => {
    // A player with no graded decisions gets null rather than a flattering 100.
    const state = playRound(42);
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const stat = statsFor(state, seat)!;
      if (stat.decided === 0) expect(stat.accuracy).toBeNull();
    }
  });
});
