import { describe, expect, it } from "vitest";
import { achievementsFor, nextUp } from "./achievements";
import type { AchievementMatch, AchievementRound } from "./achievements";

const match = (over: Partial<AchievementMatch> = {}): AchievementMatch => ({
  won: true,
  teamScore: 100,
  opponentScore: 80,
  partner: "Babo",
  finishedAt: "2026-08-27T10:00:00Z",
  ...over,
});

const round = (over: Partial<AchievementRound> = {}): AchievementRound => ({
  won: true,
  capicua: false,
  dominoed: false,
  closed: false,
  closedWon: false,
  roleAtStart: "mano",
  pipsLeft: 8,
  decided: 5,
  accuracy: 70,
  engineAgreement: 60,
  teamPlay: 50,
  mistakes: 1,
  inaccuracies: 1,
  finishedAt: "2026-08-27T10:00:00Z",
  ...over,
});

const find = (list: ReturnType<typeof achievementsFor>, id: string) =>
  list.find((a) => a.id === id)!;

describe("achievements", () => {
  it("gives nothing away on an empty history", () => {
    const list = achievementsFor([], []);
    expect(list.length).toBeGreaterThan(8);
    expect(list.every((a) => a.earnedAt === null)).toBe(true);
  });

  it("dates each one from the first time it happened, not the last", () => {
    const list = achievementsFor(
      [],
      [
        round({ capicua: true, finishedAt: "2026-08-20T10:00:00Z" }),
        round({ capicua: true, finishedAt: "2026-08-27T10:00:00Z" }),
      ]
    );
    expect(find(list, "capicua").earnedAt).toBe("2026-08-20T10:00:00Z");
  });

  it("only counts a tranca that was actually won", () => {
    const lost = achievementsFor([], [round({ closed: true, closedWon: false })]);
    expect(find(lost, "tranca").earnedAt).toBeNull();

    const won = achievementsFor([], [round({ closed: true, closedWon: true })]);
    expect(find(won, "tranca").earnedAt).not.toBeNull();
  });

  it("will not hand out a clean hand for a round with nothing to decide", () => {
    // Every move forced is not a clean round, it is an empty one.
    const forced = achievementsFor(
      [],
      [round({ decided: 0, mistakes: 0, inaccuracies: 0 })]
    );
    expect(find(forced, "clean").earnedAt).toBeNull();

    const real = achievementsFor(
      [],
      [round({ decided: 4, mistakes: 0, inaccuracies: 0 })]
    );
    expect(find(real, "clean").earnedAt).not.toBeNull();
  });

  it("counts three wins in a row only when they are consecutive", () => {
    const broken = achievementsFor(
      [
        match({ won: true, finishedAt: "2026-08-01T00:00:00Z" }),
        match({ won: false, finishedAt: "2026-08-02T00:00:00Z" }),
        match({ won: true, finishedAt: "2026-08-03T00:00:00Z" }),
        match({ won: true, finishedAt: "2026-08-04T00:00:00Z" }),
      ],
      []
    );
    expect(find(broken, "hat-trick").earnedAt).toBeNull();
    expect(find(broken, "hat-trick").progress).toEqual({ have: 2, need: 3 });

    const run = achievementsFor(
      [
        match({ won: true, finishedAt: "2026-08-01T00:00:00Z" }),
        match({ won: true, finishedAt: "2026-08-02T00:00:00Z" }),
        match({ won: true, finishedAt: "2026-08-03T00:00:00Z" }),
      ],
      []
    );
    // Dated to the win that completed it, not the first of the three.
    expect(find(run, "hat-trick").earnedAt).toBe("2026-08-03T00:00:00Z");
  });

  it("names the partner you actually win with, and ignores computers", () => {
    const list = achievementsFor(
      [
        ...Array.from({ length: 5 }, (_, i) =>
          match({ partner: "Babo", finishedAt: `2026-08-0${i + 1}T00:00:00Z` })
        ),
        match({ partner: "Computer (North)", finishedAt: "2026-08-09T00:00:00Z" }),
      ],
      []
    );
    const partnership = find(list, "partnership");
    expect(partnership.name).toContain("Babo");
    expect(partnership.earnedAt).toBe("2026-08-05T00:00:00Z");
  });

  it("does not count losses toward a partnership", () => {
    const list = achievementsFor(
      Array.from({ length: 5 }, (_, i) =>
        match({ won: false, partner: "Babo", finishedAt: `2026-08-0${i + 1}T00:00:00Z` })
      ),
      []
    );
    expect(find(list, "partnership").earnedAt).toBeNull();
  });

  it("suggests something you have started over something you have not", () => {
    const list = achievementsFor(
      [
        match({ won: true, teamScore: 100, opponentScore: 95 }),
        match({ won: true, teamScore: 100, opponentScore: 95 }),
      ],
      []
    );
    // Two of three wins is closer than anything untouched.
    expect(nextUp(list)?.id).toBe("hat-trick");
  });

  it("has nothing to suggest once everything is earned", () => {
    const done = achievementsFor([], []).map((a) => ({ ...a, earnedAt: "2026-08-27" }));
    expect(nextUp(done)).toBeNull();
  });
});
