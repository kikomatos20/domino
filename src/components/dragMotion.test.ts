import { describe, expect, it } from "vitest";
import { MAX_TILT, flyFrom, landingStart, rememberDrop, takeDrop, tiltFor } from "./dragMotion";

// Feedback f26ab57b (Kiko, in person): dragging should feel like RDomino. The
// tile leans with the motion, and a played tile glides on from where you let
// go instead of flying in from a fixed spot.
describe("how a held tile moves", () => {
  it("leans into the direction you drag it, never past the limit", () => {
    expect(tiltFor(0, 10)).toBeGreaterThan(0);
    expect(tiltFor(0, -10)).toBeLessThan(0);
    let t = 0;
    for (let i = 0; i < 50; i++) t = tiltFor(t, 400);
    expect(t).toBeLessThanOrEqual(MAX_TILT);
    expect(t).toBeGreaterThan(MAX_TILT - 0.5);
  });

  it("straightens up again once you stop", () => {
    let t = MAX_TILT;
    for (let i = 0; i < 10; i++) t = tiltFor(t, 0);
    expect(Math.abs(t)).toBeLessThan(0.1);
  });
});

describe("landing a played tile from your finger", () => {
  it("starts the landing at the drop point, in table units", () => {
    const slot = { left: 100, right: 140, top: 200, bottom: 220 };
    // Dropped 80px right and 100px below the slot's middle, on a table drawn at half size.
    expect(flyFrom({ x: 200, y: 310 }, slot, 0.5)).toEqual(["160px", "200px"]);
    expect(flyFrom({ x: 120, y: 210 }, slot, 1)).toEqual(["0px", "0px"]);
  });

  it("hands the drop pose over once, for that tile, while it is fresh", () => {
    const pose = { x: 50, y: 60, angle: -6, height: 91, top: 3 };
    rememberDrop("3-4", pose, 1000);
    expect(takeDrop("2-2", 1100)).toBeNull();
    expect(takeDrop("3-4", 1200)).toEqual(pose);
    expect(takeDrop("3-4", 1300)).toBeNull();

    rememberDrop("5-5", { ...pose, top: 5 }, 1000);
    expect(takeDrop("5-5", 1000 + 60_000)).toBeNull();
  });

  // Kiko on PR 9: the landing has to start at the ghost's size and angle, or
  // letting go pops.
  it("starts the landing as big as the ghost and turned the way it was held", () => {
    // Ghost 91px long on screen; table tile 56 units long drawn at half size = 28px.
    const ghost = { x: 0, y: 0, angle: -6, height: 91, top: 3 };
    const upright = landingStart(ghost, { vertical: true, first: 3, long: 56 }, 0.5);
    expect(upright.scale).toBeCloseTo(91 / 28);
    expect(upright.rotate).toBe(-6);
    // Upright but the other way up: half a turn round.
    expect(landingStart(ghost, { vertical: true, first: 4, long: 56 }, 0.5).rotate).toBe(174);
    // Flat with the 3 on the left: a quarter turn clockwise brings it on top.
    expect(landingStart(ghost, { vertical: false, first: 3, long: 56 }, 0.5).rotate).toBe(84);
    expect(landingStart(ghost, { vertical: false, first: 4, long: 56 }, 0.5).rotate).toBe(-96);
  });
});
