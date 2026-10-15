import { describe, expect, it } from "vitest";
import { moveTile, reconcileOrder, slotAt } from "./handOrder";
import type { Rect } from "./dropTarget";

// Feedback 2978b729 (in person): let players rearrange the tiles in their hand
// into their own order.
describe("arranging your own hand", () => {
  it("moves a tile to the slot it is dropped on", () => {
    const hand = ["1-3", "3-4", "0-6", "0-2"];
    expect(moveTile(hand, "0-2", 0)).toEqual(["0-2", "1-3", "3-4", "0-6"]);
    expect(moveTile(hand, "1-3", 3)).toEqual(["3-4", "0-6", "0-2", "1-3"]);
    expect(moveTile(hand, "3-4", 99)).toEqual(["1-3", "0-6", "0-2", "3-4"]);
    expect(moveTile(hand, "6-6", 0)).toEqual(hand);
  });

  it("keeps your order as tiles are played, and adds new tiles at the end", () => {
    const mine = ["0-2", "1-3", "3-4", "0-6"];
    expect(reconcileOrder(mine, ["1-3", "3-4", "0-6"])).toEqual(["1-3", "3-4", "0-6"]);
    expect(reconcileOrder(mine, ["5-5", "0-6", "0-2", "4-4"])).toEqual(["0-2", "0-6", "5-5", "4-4"]);
    expect(reconcileOrder([], ["2-2", "1-1"])).toEqual(["2-2", "1-1"]);
  });

  it("finds the slot from where you let go, on one row or two", () => {
    const box = (left: number, top: number): Rect => ({ left, right: left + 40, top, bottom: top + 80 });
    const row = [box(0, 600), box(50, 600), box(100, 600)];
    expect(slotAt(10, 640, row)).toBe(0);
    expect(slotAt(30, 640, row)).toBe(1);
    expect(slotAt(200, 640, row)).toBe(3);
    const wrapped = [box(0, 600), box(50, 600), box(0, 690)];
    expect(slotAt(200, 640, wrapped)).toBe(2);
    expect(slotAt(30, 720, wrapped)).toBe(3);
    expect(slotAt(10, 720, wrapped)).toBe(2);
  });
});
