import { describe, expect, it } from "vitest";
import { replayFrom } from "./replayOrder";
import type { PlacedTile } from "@/engine/types";

/** A chain in table order, with the opening tile marked. */
const line: PlacedTile[] = [
  { left: 1, right: 3, seat: 3 },
  { left: 3, right: 4, seat: 1 },
  { left: 4, right: 5, seat: 0, opening: true },
  { left: 5, right: 2, seat: 2 },
  { left: 2, right: 6, seat: 1 },
];

describe("revealing a table that arrived all at once", () => {
  it("starts from the tile that opened the round", () => {
    const first = replayFrom(line, []);
    expect(first).toHaveLength(1);
    expect(first[0].opening).toBe(true);
  });

  it("adds exactly one tile at a time until the table is caught up", () => {
    let shown: PlacedTile[] = [];
    const lengths: number[] = [];
    for (let i = 0; i < 10 && shown.length < line.length; i++) {
      shown = replayFrom(line, shown);
      lengths.push(shown.length);
    }
    expect(lengths).toEqual([1, 2, 3, 4, 5]);
  });

  it("ends up showing exactly what arrived", () => {
    let shown: PlacedTile[] = [];
    while (shown.length < line.length) shown = replayFrom(line, shown);
    expect(shown).toEqual(line);
  });

  it("only ever shows a contiguous run containing the opening tile", () => {
    // Anything else would be a floating tile with nothing to join onto.
    let shown: PlacedTile[] = [];
    while (shown.length < line.length) {
      shown = replayFrom(line, shown);
      const start = line.findIndex((t) => t === shown[0]);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(line.slice(start, start + shown.length)).toEqual(shown);
      expect(shown.some((t) => t.opening)).toBe(true);
    }
  });

  it("leaves a caught-up table alone", () => {
    expect(replayFrom(line, line)).toEqual(line);
  });

  it("copes with a chain that has no marked opening", () => {
    const unmarked = line.map(({ opening, ...rest }) => {
      void opening;
      return rest;
    });
    let shown: PlacedTile[] = [];
    for (let i = 0; i < 10 && shown.length < unmarked.length; i++) {
      shown = replayFrom(unmarked, shown);
    }
    expect(shown).toEqual(unmarked);
  });
});
