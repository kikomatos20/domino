import { describe, expect, it } from "vitest";
import type { Move } from "@/engine/types";
import { DOUBLE_TAP_MS, isDoubleTap, tapIntent, tileLabel } from "./tapPlay";

const m = (tileId: string, end: "left" | "right"): Move => ({ tileId, end }) as Move;

describe("tap to play", () => {
  it("plays straight away when the tile fits one end", () => {
    expect(tapIntent([m("3-4", "right"), m("0-3", "right")], "3-4")).toEqual({ kind: "play", end: "right" });
  });

  it("asks which end when the tile fits both", () => {
    expect(tapIntent([m("3-4", "right"), m("3-4", "left")], "3-4")).toEqual({
      kind: "choose",
      ends: ["left", "right"],
    });
  });

  it("does nothing for a tile that cannot be played", () => {
    expect(tapIntent([m("0-3", "right")], "5-6")).toEqual({ kind: "none" });
    expect(tapIntent([], "5-6")).toEqual({ kind: "none" });
  });

  it("counts a second tap on the same tile, soon enough, as a double-tap", () => {
    const first = { tileId: "3-4", at: 1000 };
    expect(isDoubleTap(first, "3-4", 1000 + DOUBLE_TAP_MS)).toBe(true);
    expect(isDoubleTap(first, "3-4", 1000 + DOUBLE_TAP_MS + 1)).toBe(false);
    expect(isDoubleTap(first, "0-3", 1100)).toBe(false);
    expect(isDoubleTap(null, "3-4", 1100)).toBe(false);
  });

  it("names tiles for screen readers", () => {
    expect(tileLabel(5, 6, true, true)).toBe("5|6, playable");
    expect(tileLabel(5, 6, false, true)).toBe("5|6, can't play");
    expect(tileLabel(5, 6, false, false)).toBe("5|6");
  });
});
