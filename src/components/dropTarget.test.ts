import { describe, expect, it } from "vitest";
import { resolveDrop, type Rect } from "./dropTarget";
import type { End } from "@/engine/types";

/** A phone-ish layout: chain across the middle, hand along the bottom. */
const ends = { left: { x: 120, y: 300 }, right: { x: 460, y: 300 } };
const hand: Rect = { left: 0, right: 600, top: 620, bottom: 780 };
const set = (...e: End[]) => new Set<End>(e);

describe("deciding where a dragged tile lands", () => {
  it("plays a one-sided tile without making you hit the target", () => {
    // The whole point of the shortcut: nothing to choose, so anywhere on the
    // table counts.
    expect(resolveDrop(300, 120, set("left"), ends, hand)).toBe("left");
    expect(resolveDrop(20, 500, set("right"), ends, hand)).toBe("right");
  });

  it("puts the tile back when you drop it on your own hand", () => {
    // Second-guessing yourself must work even with one legal end — this is the
    // case that used to play the tile out from under you.
    expect(resolveDrop(300, 700, set("left"), ends, hand)).toBeNull();
    expect(resolveDrop(300, 700, set("left", "right"), ends, hand)).toBeNull();
  });

  it("treats the edge of the hand as still being the hand", () => {
    expect(resolveDrop(0, 620, set("left"), ends, hand)).toBeNull();
    expect(resolveDrop(600, 780, set("left"), ends, hand)).toBeNull();
    // A pixel above it is the table again.
    expect(resolveDrop(300, 619, set("left"), ends, hand)).toBe("left");
  });

  it("picks the nearer end when the tile fits both", () => {
    expect(resolveDrop(140, 310, set("left", "right"), ends, hand)).toBe("left");
    expect(resolveDrop(440, 290, set("left", "right"), ends, hand)).toBe("right");
  });

  it("drops nothing when a two-sided tile lands nowhere near either end", () => {
    // With a real choice to make, a vague drop is not an instruction.
    expect(resolveDrop(300, 100, set("left", "right"), ends, hand)).toBeNull();
  });

  it("never offers an end the tile cannot legally go on", () => {
    // Right anchor is closer, but only the left end is legal.
    expect(resolveDrop(455, 300, set("left"), ends, hand)).toBe("left");
    expect(resolveDrop(455, 300, set(), ends, hand)).toBeNull();
  });

  it("still works before the hand has been measured", () => {
    expect(resolveDrop(300, 700, set("left"), ends, null)).toBe("left");
  });

  it("ignores an end with no anchor yet", () => {
    const half = { left: { x: 120, y: 300 }, right: null };
    expect(resolveDrop(460, 300, set("left", "right"), half, hand)).toBeNull();
    expect(resolveDrop(125, 305, set("left", "right"), half, hand)).toBe("left");
  });
});
