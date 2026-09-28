import { describe, expect, it } from "vitest";
import { secureRandom } from "./secureRandom";
import { makeCode, makeToken } from "./rooms";

describe("secureRandom", () => {
  it("stays in [0, 1) like Math.random", () => {
    for (let i = 0; i < 10_000; i++) {
      const x = secureRandom();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("is what tokens and codes use by default", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => makeToken()));
    expect(tokens.size).toBe(500);
    expect(makeCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
