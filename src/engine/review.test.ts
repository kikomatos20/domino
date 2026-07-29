import { describe, expect, it } from "vitest";
import { applyMove, applyPass, newMatch } from "./engine";
import { chooseMove } from "./ai";
import { reviewRound } from "./review";
import type { GameState, MoveRecord, Seat, Snapshot } from "./types";

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function playRound(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (!s.roundOver && guard++ < 200) {
    const seat = s.currentSeat;
    const move = chooseMove(s, seat, { difficulty: "medium" });
    s = move ? applyMove(s, seat, move) : applyPass(s, seat);
  }
  return s;
}

/** Minimal snapshot helper for hand-built positions. */
function snap(partial: Partial<Snapshot> & Pick<Snapshot, "hands">): Snapshot {
  return {
    line: [],
    leftEnd: null,
    rightEnd: null,
    passedOn: [[], [], [], []],
    mustOpenWithDoubleSix: false,
    ...partial,
  };
}

describe("history recording", () => {
  it("records every action of a round with the position before it", () => {
    const s = playRound(newMatch(seededRng(11)));
    expect(s.history.length).toBeGreaterThan(4);
    for (const rec of s.history) {
      expect(rec.before.hands[rec.seat].length).toBeGreaterThan(0);
      if (rec.kind === "play") {
        // The tile played must have been in that player's hand beforehand.
        expect(rec.before.hands[rec.seat]).toContain(rec.move!.tileId);
      }
    }
  });

  it("starts each round with a clean history", () => {
    const s = playRound(newMatch(seededRng(12)));
    expect(newMatch(seededRng(13)).history).toEqual([]);
    expect(s.history.every((r) => r.before.hands.flat().length > 0)).toBe(true);
  });
});

describe("reviewRound", () => {
  it("reviews only the requested player's plays", () => {
    const s = playRound(newMatch(seededRng(21)));
    const review = reviewRound(s.history, 0);
    const myPlays = s.history.filter((r) => r.seat === 0 && r.kind === "play");
    expect(review.moves.length).toBe(myPlays.length);
    expect(review.moves.map((m) => m.tileId)).toEqual(myPlays.map((r) => r.move!.tileId));
  });

  it("counts passes and reports accuracy in range", () => {
    for (const seed of [31, 32, 33, 34]) {
      const s = playRound(newMatch(seededRng(seed)));
      const review = reviewRound(s.history, 0);
      const passes = s.history.filter((r) => r.seat === 0 && r.kind === "pass").length;
      expect(review.passes).toBe(passes);
      expect(review.accuracy).toBeGreaterThanOrEqual(0);
      expect(review.accuracy).toBeLessThanOrEqual(100);
      expect(review.summary.length).toBeGreaterThan(0);
    }
  });

  it("never calls a forced move a mistake", () => {
    for (const seed of [41, 42, 43, 44, 45]) {
      const s = playRound(newMatch(seededRng(seed)));
      for (const m of reviewRound(s.history, 0).moves) {
        if (m.choices === 1) {
          expect(m.verdict).toBe("good");
          expect(m.engine).toBeNull();
        }
      }
    }
  });

  it("flags shutting out your partner", () => {
    // Partner (seat 2) has passed on 4s. Playing 4-2 on the right leaves a 4.
    const history: MoveRecord[] = [
      {
        seat: 0,
        kind: "play",
        move: { tileId: "2-4", end: "right" },
        before: snap({
          hands: [["2-4", "5-5", "0-1"], ["3-3"], ["6-6"], ["1-1"]],
          line: [{ left: 1, right: 2, seat: 1 }],
          leftEnd: 1,
          rightEnd: 2,
          passedOn: [[], [], [4], []],
        }),
      },
    ];
    const review = reviewRound(history, 0);
    const notes = review.moves[0].principles.map((n) => n.text).join(" ");
    expect(notes).toMatch(/partner/i);
    expect(review.moves[0].principles.some((n) => n.kind === "minus")).toBe(true);
  });

  it("does not blame you for a suit your partner passed on when the other end is still open to them", () => {
    // Ends 0 and 1; partner (seat 2) has passed on 0s but not on 1s.
    // Playing the 0-0 keeps the 0 end as it was and leaves the 1 end alone.
    const history: MoveRecord[] = [
      {
        seat: 0,
        kind: "play",
        move: { tileId: "0-0", end: "left" },
        before: snap({
          hands: [["0-0", "1-4"], ["2-2"], ["1-5", "6-6"], ["4-4"]],
          line: [{ left: 0, right: 1, seat: 1, opening: true }],
          leftEnd: 0,
          rightEnd: 1,
          passedOn: [[], [], [0], []],
        }),
      },
    ];
    const move = reviewRound(history, 0).moves[0];
    const text = move.principles.map((n) => n.text).join(" ");

    expect(move.principles.some((n) => n.kind === "minus")).toBe(false);
    expect(text).toMatch(/still open to them|does not shut them out/i);
    expect(move.verdict === "great" || move.verdict === "good").toBe(true);
  });

  it("only blames you when the move closes your partner's last end", () => {
    // Partner has passed on both 0s and 1s, and the move leaves 0 and 1.
    const history: MoveRecord[] = [
      {
        seat: 0,
        kind: "play",
        move: { tileId: "0-3", end: "left" },
        before: snap({
          hands: [["0-3", "1-2"], ["2-2"], ["6-6"], ["4-4"]],
          line: [{ left: 3, right: 1, seat: 1, opening: true }],
          leftEnd: 3,
          rightEnd: 1,
          passedOn: [[], [], [0, 1], []],
        }),
      },
    ];
    const move = reviewRound(history, 0).moves[0];
    expect(move.principles.some((n) => n.kind === "minus" && n.team)).toBe(true);
    expect(move.principles.map((n) => n.text).join(" ")).toMatch(/last end/i);
  });

  it("notes that the lead has shifted once a partner is already stuck", () => {
    const history: MoveRecord[] = [
      {
        seat: 0,
        kind: "play",
        move: { tileId: "0-0", end: "left" },
        before: snap({
          hands: [["0-0", "1-4"], ["2-2"], ["6-6"], ["4-4"]],
          line: [{ left: 0, right: 1, seat: 1, opening: true }],
          leftEnd: 0,
          rightEnd: 1,
          passedOn: [[], [], [0, 1], []],
        }),
      },
    ];
    const text = reviewRound(history, 0)
      .moves[0].principles.map((n) => n.text)
      .join(" ");
    expect(text).toMatch(/roles shift|lead is effectively yours/i);
  });

  it("credits squeezing an opponent who has passed on that suit", () => {
    const history: MoveRecord[] = [
      {
        seat: 0,
        kind: "play",
        move: { tileId: "2-4", end: "right" },
        before: snap({
          hands: [["2-4", "4-5", "0-1"], ["3-3"], ["6-6"], ["1-1"]],
          line: [{ left: 1, right: 2, seat: 1 }],
          leftEnd: 1,
          rightEnd: 2,
          passedOn: [[], [4], [], [4]],
        }),
      },
    ];
    const review = reviewRound(history, 0);
    expect(review.moves[0].principles.some((n) => n.kind === "plus")).toBe(true);
    expect(review.moves[0].verdict === "great" || review.moves[0].verdict === "good").toBe(true);
  });

  it("names your role relative to the opener", () => {
    // Opener is seat 1 (East). Seat 0 plays after them -> segunda.
    const mk = (openerSeat: Seat): MoveRecord[] => [
      {
        seat: openerSeat,
        kind: "play",
        move: { tileId: "6-6", end: "right" },
        before: snap({ hands: [["6-6"], ["6-6"], ["6-6"], ["6-6"]] }),
      },
    ];
    expect(reviewRound(mk(0), 0).role).toBe("mano");
    expect(reviewRound(mk(3), 0).role).toBe("segunda");
    expect(reviewRound(mk(2), 0).role).toBe("tercera");
    expect(reviewRound(mk(1), 0).role).toBe("pie");
  });

  it("tells the opener's partner to follow their suit", () => {
    // Partner (seat 2) opened with the 4-4; you hold a 4 and play elsewhere.
    const history: MoveRecord[] = [
      {
        seat: 2,
        kind: "play",
        move: { tileId: "4-4", end: "right" },
        before: snap({ hands: [[], [], ["4-4"], []] }),
      },
      {
        seat: 0,
        kind: "play",
        move: { tileId: "2-6", end: "right" },
        before: snap({
          hands: [["4-1", "2-6", "0-3"], ["3-3"], ["5-5"], ["1-1"]],
          line: [
            { left: 4, right: 4, seat: 2, opening: true },
            { left: 4, right: 2, seat: 3 },
          ],
          leftEnd: 4,
          rightEnd: 2,
        }),
      },
    ];
    const review = reviewRound(history, 0);
    expect(review.role).toBe("tercera");
    const notes = review.moves[0].principles;
    expect(notes.some((n) => n.team && n.kind === "minus")).toBe(true);
    expect(notes.map((n) => n.text).join(" ")).toMatch(/mano|partner/i);
  });

  it("praises a close that the count supports, and condemns one that loses", () => {
    // Both opponents are void in 5s and 3s, so playing 5-3 shuts the game.
    const base = {
      line: [{ left: 5, right: 3, seat: 1 as Seat, opening: true }],
      leftEnd: 5,
      rightEnd: 3,
      passedOn: [[], [5, 3], [], [5, 3]] as [number[], number[], number[], number[]],
    };
    // Your side is light: you 3 pips, partner 4 -> closing wins.
    const winning: MoveRecord[] = [
      {
        seat: 0,
        kind: "play",
        move: { tileId: "3-5", end: "right" },
        before: snap({
          ...base,
          hands: [["3-5", "0-1"], ["6-6", "6-4"], ["0-2"], ["6-5", "5-4"]],
        }),
      },
    ];
    const good = reviewRound(winning, 0).moves[0];
    expect(good.principles.some((n) => n.team && n.kind === "plus")).toBe(true);
    expect(good.principles.map((n) => n.text).join(" ")).toMatch(/cifra-base/);

    // Your side is heavy: closing hands the round over.
    const losing: MoveRecord[] = [
      {
        seat: 0,
        kind: "play",
        move: { tileId: "3-5", end: "right" },
        before: snap({
          ...base,
          hands: [["3-5", "6-6"], ["0-1"], ["6-4"], ["0-2"]],
        }),
      },
    ];
    const bad = reviewRound(losing, 0).moves[0];
    expect(bad.verdict).toBe("mistake");
    expect(bad.principles.map((n) => n.text).join(" ")).toMatch(
      /no se debe hacer para perderla/
    );
  });

  it("reports a team-play percentage", () => {
    const s = playRound(newMatch(seededRng(71)));
    const review = reviewRound(s.history, 0);
    if (review.teamPlay !== null) {
      expect(review.teamPlay).toBeGreaterThanOrEqual(0);
      expect(review.teamPlay).toBeLessThanOrEqual(100);
      expect(review.summary).toMatch(/Team play/);
    }
  });

  it("judges the opening against the regla de oro", () => {
    const history: MoveRecord[] = [
      {
        seat: 0,
        kind: "play",
        move: { tileId: "5-5", end: "right" },
        before: snap({
          hands: [["5-5", "5-1", "3-3", "3-2", "0-1", "2-6", "4-6"], [], [], []],
        }),
      },
    ];
    const review = reviewRound(history, 0);
    expect(review.moves[0].principles[0].kind).toBe("plus");
    expect(review.moves[0].principles[0].text).toMatch(/regla de oro/i);
  });

  it("provides an engine opinion whenever there was a real choice", () => {
    const s = playRound(newMatch(seededRng(51)));
    for (const m of reviewRound(s.history, 0).moves) {
      if (m.choices > 1) {
        expect(m.engine).not.toBeNull();
        expect(m.engine!.rank).toBeGreaterThanOrEqual(1);
        expect(m.engine!.rank).toBeLessThanOrEqual(m.engine!.total);
        expect(m.engine!.gap).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is deterministic — the same round reviews the same way twice", () => {
    const s = playRound(newMatch(seededRng(61)));
    const a = reviewRound(s.history, 0);
    const b = reviewRound(s.history, 0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
