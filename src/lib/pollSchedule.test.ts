import { describe, expect, it } from "vitest";
import { IDLE_AFTER_MS, POLL, pollDelay, requestsPerTableHour } from "./pollSchedule";

describe("how hard to poll", () => {
  it("barely polls while the websocket is carrying changes", () => {
    expect(pollDelay({ live: true, sinceChange: 0 })).toBe(POLL.liveActive);
    expect(pollDelay({ live: true, sinceChange: IDLE_AFTER_MS })).toBe(POLL.liveIdle);
  });

  it("polls hard the moment the socket is gone", () => {
    // With no websocket the timer is the only way a move ever arrives, so it
    // has to behave the way the old fixed poll did.
    expect(pollDelay({ live: false, sinceChange: 0 })).toBe(POLL.deadActive);
    expect(pollDelay({ live: false, sinceChange: IDLE_AFTER_MS })).toBe(POLL.deadIdle);
  });

  it("treats a finished round as idle even if it just happened", () => {
    // Nobody is waiting on a tile while the review is open.
    expect(pollDelay({ live: true, sinceChange: 0, resting: true })).toBe(POLL.liveIdle);
    expect(pollDelay({ live: false, sinceChange: 0, resting: true })).toBe(POLL.deadIdle);
  });

  it("always asks more often when the socket is down than when it is up", () => {
    for (const sinceChange of [0, 5_000, IDLE_AFTER_MS, 60_000]) {
      expect(pollDelay({ live: false, sinceChange })).toBeLessThan(
        pollDelay({ live: true, sinceChange })
      );
    }
  });

  it("cuts the request bill by several times over", () => {
    // What a table-hour used to cost: a poll every 1.5s and a ping every 20s.
    const before = requestsPerTableHour(1_500, 20_000);
    const after = requestsPerTableHour(POLL.liveActive, 30_000);

    expect(before).toBeGreaterThan(10_000);
    expect(after).toBeLessThan(before / 4);

    // And the free monthly allowance goes from a long weekend to months.
    const hoursBefore = 1_000_000 / before;
    const hoursAfter = 1_000_000 / after;
    expect(hoursBefore).toBeLessThan(120);
    expect(hoursAfter).toBeGreaterThan(500);
  });
});
