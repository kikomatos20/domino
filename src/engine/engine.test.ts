import { describe, expect, it } from "vitest";
import {
  allTiles,
  applyMove,
  applyPass,
  handPips,
  legalMoves,
  matchWinner,
  MIN_DOUBLE_LIMIT,
  mostDoubles,
  mustPass,
  newMatch,
  nextRound,
  tileId,
} from "./engine";
import { chooseMove } from "./ai";
import type { GameState, Seat } from "./types";

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Play a full round with the AI controlling all seats. */
function playRound(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (!s.roundOver && guard++ < 200) {
    const seat = s.currentSeat;
    const move = chooseMove(s, seat);
    s = move ? applyMove(s, seat, move) : applyPass(s, seat);
  }
  expect(s.roundOver).not.toBeNull();
  return s;
}

describe("setup", () => {
  it("has 28 unique tiles", () => {
    const ids = allTiles().map(tileId);
    expect(ids.length).toBe(28);
    expect(new Set(ids).size).toBe(28);
  });

  it("deals 7 tiles to each of 4 players, using all 28", () => {
    const s = newMatch(seededRng(1));
    expect(s.hands.every((h) => h.length === 7)).toBe(true);
    expect(new Set(s.hands.flat()).size).toBe(28);
  });

  it("round 1 opener holds the 6-6 and must play it", () => {
    const s = newMatch(seededRng(2));
    expect(s.hands[s.opener]).toContain("6-6");
    const moves = legalMoves(s, s.opener);
    expect(moves).toEqual([{ tileId: "6-6", end: "right" }]);
  });
});

describe("the five-doubles house rule", () => {
  it("counts the fullest hand, not the total", () => {
    expect(mostDoubles([["0-0", "1-1"], ["2-2"], [], ["3-3", "4-4", "5-5"]])).toBe(3);
    expect(mostDoubles([["0-1"], ["1-2"], ["2-3"], ["3-4"]])).toBe(0);
  });

  it("deals nobody more than the limit when the rule is on", () => {
    const rng = seededRng(101);
    for (let i = 0; i < 200; i++) {
      expect(mostDoubles(newMatch(rng, 100, 4).hands)).toBeLessThanOrEqual(4);
    }
  });

  it("keeps the rule for every round of the match, not just the first", () => {
    const rng = seededRng(202);
    // A target nobody can reach, so the match runs long enough to redeal.
    let s = newMatch(rng, 10_000, 3);
    for (let i = 0; i < 10; i++) {
      expect(mostDoubles(s.hands)).toBeLessThanOrEqual(3);
      s = nextRound(playRound(s), rng);
    }
  });

  it("still deals whole, distinct hands under the rule", () => {
    const s = newMatch(seededRng(303), 100, 4);
    expect(s.hands.every((h) => h.length === 7)).toBe(true);
    expect(new Set(s.hands.flat()).size).toBe(28);
  });

  /**
   * Seven doubles across four hands means somebody always holds at least two,
   * so a limit below two asks for a deal that cannot exist. It must still
   * deal — a bad setting is not a reason to hand back a broken table.
   */
  it("survives a limit the deck cannot satisfy", () => {
    expect(MIN_DOUBLE_LIMIT).toBe(2);
    const rng = seededRng(404);
    for (let i = 0; i < 50; i++) {
      const s = newMatch(rng, 100, 0);
      expect(s.hands.every((h) => h.length === 7)).toBe(true);
      expect(new Set(s.hands.flat()).size).toBe(28);
      expect(mostDoubles(s.hands)).toBeGreaterThanOrEqual(MIN_DOUBLE_LIMIT);
    }
  });

  it("leaves the deal alone when the rule is off", () => {
    const rng = seededRng(505);
    let seenFive = false;
    for (let i = 0; i < 2000 && !seenFive; i++) {
      if (mostDoubles(newMatch(rng).hands) >= 5) seenFive = true;
    }
    expect(seenFive).toBe(true);
  });
});

describe("moves", () => {
  it("only allows tiles matching an open end", () => {
    const s0 = newMatch(seededRng(3));
    const s1 = applyMove(s0, s0.opener, { tileId: "6-6", end: "right" });
    expect(s1.leftEnd).toBe(6);
    expect(s1.rightEnd).toBe(6);
    for (const m of legalMoves(s1, s1.currentSeat)) {
      const [a, b] = m.tileId.split("-").map(Number);
      expect(a === 6 || b === 6).toBe(true);
    }
  });

  it("rejects illegal moves", () => {
    const s0 = newMatch(seededRng(4));
    const other = ((s0.opener + 1) % 4) as Seat;
    expect(() => applyMove(s0, other, { tileId: s0.hands[other][0], end: "right" })).toThrow();
  });

  it("rejects passing when a legal move exists", () => {
    const s = newMatch(seededRng(5));
    expect(mustPass(s, s.opener)).toBe(false);
    expect(() => applyPass(s, s.opener)).toThrow();
  });

  it("keeps the line connected (adjacent halves match)", () => {
    const s = playRound(newMatch(seededRng(6)));
    for (let i = 0; i < s.line.length - 1; i++) {
      expect(s.line[i].right).toBe(s.line[i + 1].left);
    }
  });
});

describe("scoring", () => {
  it("domino: winner's team scores the opponents' remaining pips", () => {
    const s = playRound(newMatch(seededRng(7)));
    const r = s.roundOver!;
    if (r.kind === "domino") {
      const winTeam = r.winningTeam!;
      const oppPips =
        winTeam === 0 ? r.pips[1] + r.pips[3] : r.pips[0] + r.pips[2];
      expect(r.points).toBe(oppPips);
      expect(s.matchScore[winTeam]).toBe(oppPips);
      expect(r.pips[r.winnerSeat!]).toBe(0);
    }
  });

  it("blocked: lower-pip team wins opponents' total; tie scores nothing", () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = playRound(newMatch(seededRng(1000 + seed)));
      const r = s.roundOver!;
      if (r.kind === "blocked") {
        const t0 = r.pips[0] + r.pips[2];
        const t1 = r.pips[1] + r.pips[3];
        expect(t0).not.toBe(t1);
        const winTeam = t0 < t1 ? 0 : 1;
        expect(r.winningTeam).toBe(winTeam);
        expect(r.points).toBe(Math.max(t0, t1));
      } else if (r.kind === "tie") {
        expect(r.points).toBe(0);
        expect(r.winningTeam).toBeNull();
      }
    }
  });

  it("pip counting is correct", () => {
    expect(handPips(["6-6", "0-0", "2-5"])).toBe(19);
    expect(handPips([])).toBe(0);
  });
});

describe("full match", () => {
  it("plays to 100 and produces a winner (many seeds)", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rng = seededRng(seed * 31);
      let s = newMatch(rng);
      let guard = 0;
      while (!s.matchOver && guard++ < 100) {
        s = playRound(s);
        if (!s.matchOver) s = nextRound(s, rng);
      }
      expect(s.matchOver).toBe(true);
      const w = matchWinner(s)!;
      expect(s.matchScore[w]).toBeGreaterThanOrEqual(100);
      expect(s.matchScore[(1 - w) as 0 | 1]).toBeLessThan(100);
    }
  });

  it("passes the opening round the table, counter-clockwise", () => {
    const rng = seededRng(99);
    let s = playRound(newMatch(rng));
    const first = s.opener;

    // Only the first round is forced to the double six; later openers are free.
    for (let round = 1; round <= 4 && !s.matchOver; round++) {
      s = nextRound(s, rng);
      expect(s.opener).toBe(((first + round) % 4) as Seat);
      expect(s.mustOpenWithDoubleSix).toBe(false);
      expect(legalMoves(s, s.opener).length).toBe(7);
      s = playRound(s);
    }
  });

  it("does not hand the opening to the round winner", () => {
    const rng = seededRng(123);
    let s = playRound(newMatch(rng));
    let checked = 0;
    for (let i = 0; i < 6 && !s.matchOver; i++) {
      const before = s.opener;
      s = nextRound(s, rng);
      expect(s.opener).toBe(((before + 1) % 4) as Seat);
      checked++;
      s = playRound(s);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
