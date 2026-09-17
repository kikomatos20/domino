import { describe, expect, it } from "vitest";
import {
  expectedShare,
  PROVISIONAL_UNTIL,
  ratingsFrom,
  RATING_CEILING,
  RATING_FLOOR,
  RATING_START,
} from "./rating";
import type { RatedMatch } from "./rating";

let day = 0;
/** A match on the next day, so history always has an order. */
const played = (
  teamA: string[],
  teamB: string[],
  scoreA: number,
  scoreB: number
): RatedMatch => ({
  finishedAt: new Date(Date.UTC(2026, 0, 1 + day++)).toISOString(),
  teamA,
  teamB,
  scoreA,
  scoreB,
});

const rate = (matches: RatedMatch[]) => ratingsFrom(matches);
const of = (matches: RatedMatch[], id: string) => rate(matches).get(id)!.rating;

/** The same match played over and over, for settling a rating somewhere. */
function repeat(n: number, make: () => RatedMatch): RatedMatch[] {
  return Array.from({ length: n }, make);
}

describe("expected score", () => {
  it("is an even split between equals", () => {
    expect(expectedShare(4, 4)).toBeCloseTo(0.5, 10);
  });

  it("favours the stronger side, and symmetrically", () => {
    expect(expectedShare(5, 4)).toBeGreaterThan(0.5);
    expect(expectedShare(4, 5)).toBeCloseTo(1 - expectedShare(5, 4), 10);
  });

  it("makes a full point of rating a heavy favourite, not a certainty", () => {
    const heavy = expectedShare(5, 4);
    expect(heavy).toBeGreaterThan(0.75);
    expect(heavy).toBeLessThan(0.9);
  });
});

describe("rating a match", () => {
  it("starts everyone in the same place and says so", () => {
    const one = rate([played(["a", "b"], ["c", "d"], 100, 60)]);
    expect(one.get("a")!.matches).toBe(1);
    expect(one.get("a")!.provisional).toBe(true);
    expect(one.get("a")!.rating).toBeGreaterThan(RATING_START);
    expect(one.get("c")!.rating).toBeLessThan(RATING_START);
  });

  it("moves both winners up and both losers down by the same amount at first", () => {
    const r = rate([played(["a", "b"], ["c", "d"], 100, 60)]);
    expect(r.get("a")!.rating).toBeCloseTo(r.get("b")!.rating, 10);
    expect(r.get("c")!.rating).toBeCloseTo(r.get("d")!.rating, 10);
  });

  it("cares how close it was, not just who won", () => {
    const narrow = of([played(["a", "b"], ["c", "d"], 100, 95)], "a");
    const thumping = of([played(["a", "b"], ["c", "d"], 100, 10)], "a");
    expect(thumping).toBeGreaterThan(narrow);
  });

  it("stops being provisional once there is enough to go on", () => {
    const many = rate(
      repeat(PROVISIONAL_UNTIL, () => played(["a", "b"], ["c", "d"], 100, 80))
    );
    expect(many.get("a")!.matches).toBe(PROVISIONAL_UNTIL);
    expect(many.get("a")!.provisional).toBe(false);
  });

  it("settles down: a newcomer moves further on one result than a regular", () => {
    const history = repeat(20, () => played(["a", "b"], ["c", "d"], 100, 80));
    const settled = rate([...history, played(["a", "b"], ["c", "d"], 100, 0)]);
    const fresh = rate([played(["e", "f"], ["g", "h"], 100, 0)]);
    expect(Math.abs(settled.get("a")!.lastChange)).toBeLessThan(
      Math.abs(fresh.get("e")!.lastChange)
    );
  });

  it("never leaves the scale, however lopsided the history", () => {
    const r = rate(repeat(300, () => played(["a", "b"], ["c", "d"], 100, 0)));
    expect(r.get("a")!.rating).toBeLessThanOrEqual(RATING_CEILING);
    expect(r.get("c")!.rating).toBeGreaterThanOrEqual(RATING_FLOOR);
  });

  it("ignores a match nobody scored in, and one with nobody in it", () => {
    expect(rate([played(["a"], ["b"], 0, 0)]).size).toBe(0);
    expect(rate([played([], [], 100, 0)]).size).toBe(0);
  });

  it("replays in the order things happened, not the order they arrive", () => {
    const a = played(["a", "b"], ["c", "d"], 100, 20);
    const b = played(["a", "b"], ["c", "d"], 40, 100);
    expect(of([a, b], "a")).toBeCloseTo(of([b, a], "a"), 10);
  });
});

/**
 * The part worth being careful about: who you play with, and who you play
 * against, both change what counts as a good result.
 */
describe("partners and opponents", () => {
  /** Play someone up to a rating, then read it back. */
  function settled(id: string, wins: number): RatedMatch[] {
    return repeat(wins, () => played([id, "mate"], ["x", "y"], 100, 30));
  }

  it("does not punish you for a weak partner — it lowers the bar instead", () => {
    // Build a strong player and a weak one, then pair them.
    const history = [
      ...settled("strong", 25),
      ...repeat(25, () => played(["p", "q"], ["weak", "r"], 100, 20)),
    ];

    const before = rate(history);
    expect(before.get("strong")!.rating).toBeGreaterThan(
      before.get("weak")!.rating
    );

    // Strong carries weak to a modest win over two average players.
    const after = rate([...history, played(["strong", "weak"], ["n1", "n2"], 100, 70)]);
    // The team average is dragged down by the weak partner, so a modest win
    // is roughly what was expected — nobody is punished for the pairing.
    expect(after.get("strong")!.rating).toBeGreaterThan(
      before.get("strong")!.rating - 0.1
    );
  });

  it("rewards keeping it close against a stronger pair, even in defeat", () => {
    const history = [
      ...settled("ace1", 25),
      ...repeat(25, () => played(["ace2", "m"], ["v", "w"], 100, 25)),
    ];
    const before = rate(history);

    // A newcomer pair loses narrowly to two established winners.
    const after = rate([
      ...history,
      played(["rookie", "friend"], ["ace1", "ace2"], 95, 100),
    ]);
    expect(after.get("rookie")!.rating).toBeGreaterThan(RATING_START);
    // And the favourites are marked down for scraping it.
    expect(after.get("ace1")!.rating).toBeLessThan(before.get("ace1")!.rating);
  });

  it("marks down a heavy favourite who only just gets there", () => {
    const history = repeat(25, () => played(["fav1", "fav2"], ["u1", "u2"], 100, 15));
    const before = rate(history);
    const after = rate([...history, played(["fav1", "fav2"], ["u1", "u2"], 100, 90)]);
    expect(after.get("fav1")!.rating).toBeLessThan(before.get("fav1")!.rating);
    // Winning is never nothing, though — the losers do not gain on the winners
    // in absolute terms by losing.
    expect(after.get("u1")!.rating).toBeGreaterThan(before.get("u1")!.rating);
  });

  it("treats an unknown seat as an average player, not as an absent one", () => {
    // One rated player with a guest partner should be read as an average team,
    // not as a team of one strong player.
    const solo = rate([played(["a"], ["b"], 100, 50)]);
    const pair = rate([played(["a", "a2"], ["b", "b2"], 100, 50)]);
    // With everyone starting equal the two are the same; the difference only
    // shows once ratings diverge, which the next assertion covers.
    expect(solo.get("a")!.rating).toBeCloseTo(pair.get("a")!.rating, 10);

    const history = repeat(25, () => played(["star", "s2"], ["t1", "t2"], 100, 10));
    const before = rate(history);
    // The star plays with a guest. Expectation must sit between the star's
    // rating and the middle, not at the star's rating.
    const withGuest = rate([...history, played(["star"], ["t1", "t2"], 100, 40)]);
    const withPeer = rate([
      ...history,
      played(["star", "s2"], ["t1", "t2"], 100, 40),
    ]);
    // The guest team is weaker on paper, so the same score is a better result.
    expect(withGuest.get("star")!.rating - before.get("star")!.rating).toBeGreaterThan(
      withPeer.get("star")!.rating - before.get("star")!.rating
    );
  });
});
