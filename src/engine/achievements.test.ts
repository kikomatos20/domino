import { describe, expect, it } from "vitest";
import { achievementsFor, earnedInRound, nextUp } from "./achievements";
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

  it("spots what a single round earned, without the rest of your history", () => {
    const fresh = earnedInRound(round({ capicua: true, dominoed: true }), new Set());
    expect(fresh.map((a) => a.id)).toEqual(
      expect.arrayContaining(["capicua", "dominoed"])
    );
  });

  it("stays quiet about something already earned", () => {
    const already = new Set(["capicua", "dominoed"]);
    expect(earnedInRound(round({ capicua: true, dominoed: true }), already)).toEqual([]);
  });

  it("does not announce a clean hand for a round with nothing decided", () => {
    const forced = earnedInRound(
      round({ decided: 0, mistakes: 0, inaccuracies: 0 }),
      new Set()
    );
    expect(forced.map((a) => a.id)).not.toContain("clean");
  });

  it("agrees with the full history version on the same round", () => {
    // The two paths must not drift: one judges a round on its own, the other
    // judges a lifetime, and they have to reach the same verdict.
    const one = round({ capicua: true, dominoed: true, closed: false });
    const live = earnedInRound(one, new Set()).map((a) => a.id).sort();
    const history = achievementsFor([], [one])
      .filter((a) => a.earnedAt && a.id !== "partnership" && a.id !== "hat-trick")
      .map((a) => a.id)
      .sort();
    expect(live).toEqual(history);
  });

  it("climbs bronze, silver, gold, platinum as you do it again", () => {
    const capicuas = (n: number) =>
      achievementsFor(
        [],
        Array.from({ length: n }, (_, i) =>
          // Spread over months so the dates stay real and sortable.
          round({ capicua: true, finishedAt: `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z` })
        )
      );

    const once = find(capicuas(1), "capicua");
    expect(once.tier).toMatchObject({ level: 1, levels: 4, key: "bronze", top: false });
    expect(once.progress).toEqual({ have: 1, need: 5 });

    expect(find(capicuas(5), "capicua").tier).toMatchObject({ level: 2, key: "silver" });
    expect(find(capicuas(15), "capicua").tier).toMatchObject({ level: 3, key: "gold" });

    const platinum = find(capicuas(40), "capicua").tier!;
    expect(platinum).toMatchObject({ level: 4, key: "platinum", top: true });

    // At the top, progress sits full rather than pointing at a rung that is
    // not there — but the count keeps rising.
    const beyond = find(capicuas(45), "capicua");
    expect(beyond.progress).toEqual({ have: 40, need: 40 });
    expect(beyond.tier!.times).toBe(45);
  });

  it("gives every tiered achievement the same four rungs", () => {
    const tiered = achievementsFor([], []).filter((a) => a.tier);
    expect(tiered.length).toBeGreaterThan(8);
    for (const a of tiered) {
      expect(a.tier!.levels).toBe(4);
      // Nothing is standing on a rung before it has happened once.
      expect(a.tier!.key).toBe("none");
      expect(a.tier!.top).toBe(false);
    }
  });

  it("puts platinum well beyond gold, so it cannot be had in a week", () => {
    // Gold on capicúas is 15; platinum is 40, so 39 is not enough.
    const nearly = achievementsFor(
      [],
      Array.from({ length: 39 }, (_, i) =>
        round({ capicua: true, finishedAt: `2026-0${1 + (i % 9)}-0${1 + (i % 9)}T00:00:00Z` })
      )
    );
    expect(find(nearly, "capicua").tier!.key).toBe("gold");
  });

  it("still dates a tiered one to the first time, however many follow", () => {
    const list = achievementsFor(
      [],
      [
        round({ capicua: true, finishedAt: "2026-08-20T10:00:00Z" }),
        round({ capicua: true, finishedAt: "2026-08-01T10:00:00Z" }),
        round({ capicua: true, finishedAt: "2026-08-27T10:00:00Z" }),
      ]
    );
    expect(find(list, "capicua").earnedAt).toBe("2026-08-01T10:00:00Z");
  });

  it("wants real team decisions before calling it team play", () => {
    // A perfect score out of one decision is not a round of team play.
    const thin = achievementsFor([], [round({ teamPlay: 100, teamCalls: 1 })]);
    expect(find(thin, "fourteen-tiles").earnedAt).toBeNull();

    const real = achievementsFor([], [round({ teamPlay: 100, teamCalls: 4 })]);
    expect(find(real, "fourteen-tiles").earnedAt).not.toBeNull();
  });

  it("no longer rewards losing", () => {
    const list = achievementsFor([], [round({ won: false, pipsLeft: 2 })]);
    expect(list.find((a) => a.id === "light")).toBeUndefined();
  });

  it("recognises the cabeza, carrying the round, and leading it throughout", () => {
    const held = achievementsFor([], [round({ keptCabeza: 2 })]);
    expect(find(held, "cabeza").earnedAt).not.toBeNull();

    const carried = achievementsFor([], [round({ won: true, partnerPassed: true })]);
    expect(find(carried, "carried").earnedAt).not.toBeNull();

    // Losing it does not count, however the round was played.
    const lost = achievementsFor([], [round({ won: false, partnerPassed: true })]);
    expect(find(lost, "carried").earnedAt).toBeNull();

    const led = achievementsFor([], [round({ won: true, ledThroughout: true })]);
    expect(find(led, "wire-to-wire").earnedAt).not.toBeNull();
  });

  /**
   * Rounds recorded before these signals existed have no opinion about them.
   * A missing value must read as "not established" rather than as a zero that
   * quietly hands out — or withholds — an achievement.
   */
  it("gives an older round nothing it cannot vouch for", () => {
    const old = round({ won: true, teamPlay: 100 });
    const list = achievementsFor([], [old]);
    for (const id of ["cabeza", "carried", "wire-to-wire", "fourteen-tiles"]) {
      expect(find(list, id).earnedAt).toBeNull();
    }
    expect(earnedInRound(old, new Set()).map((a) => a.id)).not.toContain("cabeza");
  });

  it("has nothing to suggest once everything is earned", () => {
    const done = achievementsFor([], []).map((a) => ({ ...a, earnedAt: "2026-08-27" }));
    expect(nextUp(done)).toBeNull();
  });
});
