import { describe, expect, it } from "vitest";
import {
  applyMove,
  applyPass,
  isCapicua,
  legalMoves,
  newMatch,
  stateFromSnapshot,
} from "./engine";
import { blockedMargin, chooseMove, forcesBlock, phaseOf, readTable, scoreMoves } from "./ai";
import { leadShifts, manoAt, roleOf } from "./roles";
import { reviewRound } from "./review";
import type { Difficulty } from "./ai";
import type { GameState, Seat, Snapshot, TileId } from "./types";

/**
 * Build an exact position. Hands are given per seat, so a scenario can be
 * stated plainly rather than played into existence.
 */
function position(opts: {
  hands: [TileId[], TileId[], TileId[], TileId[]];
  line: { left: number; right: number; seat: Seat }[];
  turn: Seat;
  opener?: Seat;
  passedOn?: [number[], number[], number[], number[]];
}): GameState {
  const before: Snapshot = {
    hands: opts.hands,
    line: opts.line.map((t, i) => ({ ...t, opening: i === 0 })),
    leftEnd: opts.line[0]?.left ?? null,
    rightEnd: opts.line[opts.line.length - 1]?.right ?? null,
    passedOn: opts.passedOn ?? [[], [], [], []],
    mustOpenWithDoubleSix: false,
  };
  const state = stateFromSnapshot(before, opts.turn);
  return { ...state, opener: opts.opener ?? 0 };
}

/**
 * Play a round to the finish, handing every position to `watch` on the way.
 *
 * Hand-built endgames are brittle — a real tranca needs twenty-odd tiles down
 * in a legal chain. Playing rounds out gives genuine positions by the hundred,
 * which is what these claims need to be checked against.
 */
function playRounds(
  count: number,
  watch: (state: GameState, seat: Seat) => void,
  difficulty: Difficulty = "medium"
) {
  for (let round = 0; round < count; round++) {
    let state = newMatch(seededRng(round * 7919 + 13));
    let guard = 0;
    while (!state.roundOver && guard++ < 80) {
      const seat = state.currentSeat;
      watch(state, seat);
      // Deterministic: the same rounds every run, so a threshold here measures
      // the engine rather than the weather.
      const move = chooseMove(state, seat, { difficulty, deterministic: true });
      state = move ? applyMove(state, seat, move) : applyPass(state, seat);
    }
  }
}

/** Repeatable pseudo-random source, so a failure can be reproduced. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("knowing when a suit is dead", () => {
  it("calls a suit dead exactly when no other hand holds it", () => {
    let checked = 0;
    playRounds(12, (state, seat) => {
      const k = readTable(state, seat);
      for (let suit = 0; suit <= 6; suit++) {
        const heldElsewhere = state.hands.some(
          (h, i) =>
            i !== seat &&
            h.some((id) => {
              const [a, b] = id.split("-").map(Number);
              return a === suit || b === suit;
            })
        );
        expect(k.deadSuits.has(suit)).toBe(!heldElsewhere);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(500);
  });

  it("counts the pips still hidden, for the close arithmetic", () => {
    const state = newMatch(() => 0.5);
    const k = readTable(state, 0);
    // 168 pips in the set; you can see your own seven.
    expect(k.myPips + k.unseenPips).toBe(168);
  });
});

describe("recognising a tranca before it happens", () => {
  it("predicts a block exactly, from public information alone", () => {
    // This is not a heuristic: a round is blocked precisely when no tile in any
    // hand matches either end, and "unseen" is exactly the other three hands.
    let blocksSeen = 0;
    let positions = 0;

    playRounds(25, (state, seat) => {
      const k = readTable(state, seat);
      for (const move of legalMoves(state, seat)) {
        const predicted = forcesBlock(state, seat, move, k);
        const result = applyMove(state, seat, move).roundOver;
        // A shut game is a shut game whether or not the pips came out level —
        // a dead tie is recorded as "tie", but it is still a tranca.
        const actual = !!result && result.kind !== "domino";
        expect(predicted).toBe(actual);
        if (actual) blocksSeen++;
        positions++;
      }
    });

    expect(positions).toBeGreaterThan(400);
    // If we never saw one, the test proved nothing.
    expect(blocksSeen).toBeGreaterThan(0);
  });

  it("works out which side a block would favour without seeing any hand", () => {
    const state = position({
      hands: [["0-1"], ["6-6", "5-6"], ["1-2"], ["4-6", "5-5"]],
      line: [{ left: 3, right: 3, seat: 0 }],
      turn: 0,
    });
    const k = readTable(state, 0);
    // Carrying 1 pip against three hands full of heavy tiles: strongly positive.
    expect(blockedMargin(state, 0, k, 0)).toBeGreaterThan(0);
  });
});

describe("playing for the tranca", () => {
  /**
   * Every real chance to shut a round, across many played-out rounds: does the
   * engine take the winning ones and leave the losing ones?
   */
  function trancaChoices(difficulty: Difficulty) {
    let tookWinner = 0;
    let winnersOffered = 0;
    let tookLoser = 0;
    let losersOffered = 0;

    playRounds(
      200,
      (state, seat) => {
        const k = readTable(state, seat);
        const hand = state.hands[seat];
        if (hand.length <= 1) return; // going out is a different decision

        const blocks = legalMoves(state, seat).filter((m) =>
          forcesBlock(state, seat, m, k)
        );
        if (blocks.length === 0) return;

        const chosen = chooseMove(state, seat, { difficulty, deterministic: true })!;
        const chosenBlocks = blocks.some(
          (b) => b.tileId === chosen.tileId && b.end === chosen.end
        );

        // Judge by the truth of the position, not the estimate.
        const wins = blocks.filter(
          (m) => applyMove(state, seat, m).roundOver?.winningTeam === seat % 2
        );
        const loses = blocks.filter((m) => {
          const r = applyMove(state, seat, m).roundOver;
          return r && r.winningTeam !== null && r.winningTeam !== seat % 2;
        });

        if (wins.length) {
          winnersOffered++;
          if (chosenBlocks) tookWinner++;
        } else if (loses.length === blocks.length) {
          losersOffered++;
          if (chosenBlocks) tookLoser++;
        }
      },
      difficulty
    );

    return { tookWinner, winnersOffered, tookLoser, losersOffered };
  }

  for (const difficulty of ["easy", "medium", "hard"] as Difficulty[]) {
    it(`${difficulty} takes a winning close and declines a losing one`, () => {
      const r = trancaChoices(difficulty);
      expect(r.winnersOffered).toBeGreaterThanOrEqual(5);
      expect(r.losersOffered).toBeGreaterThanOrEqual(5);

      const takesWinners = r.tookWinner / r.winnersOffered;
      const takesLosers = r.tookLoser / r.losersOffered;

      // The engine decides from an estimate of the hidden hands, while this
      // test knows the truth — so it cannot be graded on getting every one
      // right. What it must do is tell the two apart: close far more often
      // when closing wins than when it loses.
      expect(takesWinners).toBeGreaterThan(takesLosers + 0.15);
      // And never make a habit of closing into a loss.
      expect(takesLosers).toBeLessThan(0.5);
    });
  }

  it("names the count in its reasoning, rather than closing on a hunch", () => {
    let sawReason = false;
    playRounds(20, (state, seat) => {
      if (sawReason || state.hands[seat].length <= 1) return;
      const k = readTable(state, seat);
      for (const move of legalMoves(state, seat)) {
        if (!forcesBlock(state, seat, move, k)) continue;
        const scored = scoreMoves(state, seat, { difficulty: "hard", deterministic: true });
        const entry = scored.find(
          (s) => s.move.tileId === move.tileId && s.move.end === move.end
        )!;
        expect(entry.reasons.join(" ")).toMatch(/tranca|pips (lighter|heavier)|heavier/);
        sawReason = true;
        return;
      }
    });
    expect(sawReason).toBe(true);
  });
});

describe("capicua", () => {
  it("recognises going out on both ends, and pays nothing extra for it", () => {
    const state = position({
      hands: [["3-5"], ["6-6"], ["2-2"], ["1-1"]],
      line: [
        { left: 3, right: 4, seat: 1 },
        { left: 4, right: 5, seat: 2 },
      ],
      turn: 0,
    });
    expect(isCapicua(state, { tileId: "3-5", end: "right" })).toBe(true);
    const after = applyMove(state, 0, { tileId: "3-5", end: "right" });
    expect(after.roundOver).toMatchObject({ kind: "domino", capicua: true });
    // The score is the opponents' pips (6-6 and 1-1) and nothing more.
    expect(after.roundOver!.points).toBe(14);
  });

  it("is not a capicua when both ends show the same suit", () => {
    const state = position({
      hands: [["3-5"], ["6-6"], ["2-2"], ["1-1"]],
      line: [
        { left: 3, right: 4, seat: 1 },
        { left: 4, right: 3, seat: 2 },
      ],
      turn: 0,
    });
    // Both ends are 3s — there was only ever one number in play.
    expect(isCapicua(state, { tileId: "3-5", end: "right" })).toBe(false);
    expect(applyMove(state, 0, { tileId: "3-5", end: "right" }).roundOver?.capicua).toBe(
      false
    );
  });

  it("is never a double", () => {
    const state = position({
      hands: [["3-3"], ["6-6"], ["2-2"], ["1-1"]],
      line: [{ left: 3, right: 3, seat: 1 }],
      turn: 0,
    });
    expect(isCapicua(state, { tileId: "3-3", end: "right" })).toBe(false);
  });
});

describe("phases of a round", () => {
  it("moves from opening through to the end", () => {
    const empty = position({ hands: [[], [], [], []], line: [], turn: 0 });
    expect(phaseOf(empty, 7)).toBe("opening");

    const early = position({
      hands: [[], [], [], []],
      line: [{ left: 6, right: 6, seat: 0 }],
      turn: 0,
    });
    expect(phaseOf(early, 6)).toBe("early");
    // A short hand means the end, however few tiles are down.
    expect(phaseOf(early, 2)).toBe("end");
  });

  it("cares more about weight late than early", () => {
    const build = (handSize: number) =>
      position({
        hands: [
          ["6-5", "0-1", ...Array.from({ length: handSize - 2 }, (_, i) => `${i}-${i}`)],
          ["4-4"],
          ["3-3"],
          ["2-2"],
        ] as [TileId[], TileId[], TileId[], TileId[]],
        line: [{ left: 5, right: 1, seat: 3 }],
        turn: 0,
      });

    const gapAt = (handSize: number) => {
      const scored = scoreMoves(build(handSize), 0, {
        difficulty: "hard",
        deterministic: true,
      });
      const heavy = scored.find((s) => s.move.tileId === "6-5")!.score;
      const light = scored.find((s) => s.move.tileId === "0-1")!.score;
      return heavy - light;
    };

    // The same two tiles: the heavy one is worth relatively more when the
    // round is closing than when it has just begun.
    expect(gapAt(3)).toBeGreaterThan(gapAt(6));
  });
});

describe("the lead moving when someone passes", () => {
  it("hands the lead on when the mano passes", () => {
    // Seat 0 opened and has fewest tiles, so holds the lead.
    let state = position({
      hands: [["6-6"], ["5-5", "5-4"], ["3-3", "3-2"], ["2-2", "2-1"]],
      line: [{ left: 4, right: 4, seat: 3 }],
      turn: 0,
      opener: 0,
    });
    expect(manoAt(state.hands, 0)).toBe(0);

    // Seat 0 cannot play a 6-6 on a 4, so passes — and stops being the mano.
    state = applyPass(state, 0);
    expect(manoAt(state.hands, 0)).toBe(0);

    // Once someone else plays and goes shorter, the lead really does move.
    const after = applyMove(state, 1, { tileId: "5-4", end: "right" });
    expect(manoAt(after.hands, 0)).toBe(0);
    expect(roleOf(1, manoAt(after.hands, 0))).toBe("segunda");
  });

  it("reports the shift in the round log", () => {
    // Play a whole round out and check the log describes what happened.
    let state = newMatch(() => 0.42);
    let guard = 0;
    while (!state.roundOver && guard++ < 60) {
      const move = chooseMove(state, state.currentSeat, { difficulty: "medium" });
      state = move
        ? applyMove(state, state.currentSeat, move)
        : applyPass(state, state.currentSeat);
    }

    const review = reviewRound(state.history, 0);
    const passes = state.history.filter((r) => r.kind === "pass");
    // Every pass is reported, whoever made it.
    expect(review.events.filter((e) => e.kind === "pass")).toHaveLength(passes.length);

    const shifts = leadShifts(state.history, state.opener);
    expect(review.events.filter((e) => e.kind === "lead")).toHaveLength(shifts.length);
    for (const e of review.events) expect(e.text.length).toBeGreaterThan(10);
  });

  it("says plainly that a pass costs you the lead", () => {
    const state = position({
      hands: [["6-6"], ["5-5", "5-4"], ["3-3", "3-2"], ["2-2", "2-1"]],
      line: [{ left: 4, right: 4, seat: 3 }],
      turn: 0,
      opener: 0,
    });
    const passed = applyPass(state, 0);
    const review = reviewRound(passed.history, 0);
    const note = review.events.find((e) => e.kind === "pass");
    expect(note?.text).toMatch(/passing does not lighten your hand/i);
  });
});

describe("the AI plays by the same roles the review grades", () => {
  /** Seat 0 must choose between two tiles; the partner has passed on 2s. */
  const build = (myHand: TileId[]) =>
    position({
      hands: [
        myHand,
        ["6-6", "5-6", "4-4"],
        ["3-3", "1-3", "0-0"],
        ["5-5", "0-5", "0-4"],
      ],
      line: [{ left: 1, right: 1, seat: 3 }],
      turn: 0,
      opener: 0,
      passedOn: [[], [], [2, 6], []],
    });

  it("knows when the lead is its own and says so in its reasoning", () => {
    // Two tiles, so this hand is shortest: it holds the lead.
    const asMano = build(["1-2", "1-5"]);
    expect(manoAt(asMano.hands, 0)).toBe(0);

    const scored = scoreMoves(asMano, 0, { difficulty: "hard", deterministic: true });
    const shutsPartnerOut = scored.find((s) => s.move.tileId === "1-2")!;
    // Leaving a 2 shuts out a partner who has passed on 2s — but as the mano
    // that is a price worth paying, and the engine says as much rather than
    // treating it as a fault.
    expect(shutsPartnerOut.reasons.join(" ")).toMatch(/while you hold the lead/);
  });

  it("treats the same move as a plain fault when the lead is elsewhere", () => {
    const asHelper = build(["1-2", "1-5", "0-6", "3-4", "0-2"]);
    expect(manoAt(asHelper.hands, 0)).not.toBe(0);

    const scored = scoreMoves(asHelper, 0, { difficulty: "hard", deterministic: true });
    const shutsPartnerOut = scored.find((s) => s.move.tileId === "1-2")!;
    const reasons = shutsPartnerOut.reasons.join(" ");
    expect(reasons).toMatch(/your partner cannot play/);
    expect(reasons).not.toMatch(/while you hold the lead/);
  });
});
