import { describe, expect, it } from "vitest";
import { applyMove, applyPass, matchWinner, newMatch, nextRound } from "./engine";
import { chooseMove, readTable, resultingEnds } from "./ai";
import type { Difficulty } from "./ai";
import type { GameState, Seat } from "./types";

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Team 0 (seats 0 & 2) plays `a`; team 1 (seats 1 & 3) plays `b`. */
function playMatch(a: Difficulty, b: Difficulty, seed: number): 0 | 1 {
  const rng = seededRng(seed);
  let s: GameState = newMatch(rng);
  let guard = 0;
  while (!s.matchOver && guard++ < 200) {
    let inner = 0;
    while (!s.roundOver && inner++ < 300) {
      const seat = s.currentSeat as Seat;
      const move = chooseMove(s, seat, {
        difficulty: seat % 2 === 0 ? a : b,
        deterministic: true,
      });
      s = move ? applyMove(s, seat, move) : applyPass(s, seat);
    }
    if (!s.matchOver) s = nextRound(s, rng);
  }
  return matchWinner(s)!;
}

/** Play every seed twice with the sides swapped, cancelling any seat bias. */
function winRate(a: Difficulty, b: Difficulty, pairs: number): number {
  let wins = 0;
  for (let i = 0; i < pairs; i++) {
    const seed = i * 7919 + 13;
    if (playMatch(a, b, seed) === 0) wins++;
    if (playMatch(b, a, seed) === 1) wins++;
  }
  return wins / (pairs * 2);
}

describe("AI strength ladder", () => {
  it("is unbiased when both sides play the same way", () => {
    const rate = winRate("hard", "hard", 40);
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(0.6);
  });

  it("hard beats medium", () => {
    expect(winRate("hard", "medium", 40)).toBeGreaterThan(0.56);
  });

  it("medium beats easy", () => {
    expect(winRate("medium", "easy", 40)).toBeGreaterThan(0.65);
  });

  it("hard beats easy by the widest margin", () => {
    expect(winRate("hard", "easy", 40)).toBeGreaterThan(0.7);
  });
});

describe("table reading", () => {
  it("counts unseen tiles and spots outstanding doubles", () => {
    const s = newMatch(seededRng(7));
    const k = readTable(s, 0);
    // Nothing played yet: 28 tiles less my 7 are unseen.
    expect(k.unseen.length).toBe(21);
    expect(k.tilesOut).toBe(21);
    // Every double I don't hold is still outstanding.
    for (let v = 0; v <= 6; v++) {
      const mine = s.hands[0].includes(`${v}-${v}`);
      expect(k.outstandingDoubles.has(v)).toBe(!mine);
    }
  });

  it("treats a pass as a void in both open ends", () => {
    let s = newMatch(seededRng(8));
    s = applyMove(s, s.opener, { tileId: "6-6", end: "right" });
    // Force a pass by emptying the next player's playable tiles.
    const seat = s.currentSeat;
    s = { ...s, hands: s.hands.map((h, i) => (i === seat ? ["0-1"] : h)) as GameState["hands"] };
    s = applyPass(s, seat);
    const k = readTable(s, ((seat + 1) % 4) as Seat);
    expect(k.voids[seat].has(6)).toBe(true);
  });

  it("computes the ends a move leaves behind", () => {
    let s = newMatch(seededRng(9));
    s = applyMove(s, s.opener, { tileId: "6-6", end: "right" });
    const seat = s.currentSeat;
    s = { ...s, hands: s.hands.map((h, i) => (i === seat ? ["6-3"] : h)) as GameState["hands"] };
    expect(resultingEnds(s, { tileId: "6-3", end: "right" })).toEqual([6, 3]);
    expect(resultingEnds(s, { tileId: "6-3", end: "left" })).toEqual([3, 6]);
  });
});
