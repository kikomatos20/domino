import { describe, expect, it } from "vitest";
import { chooseOpening } from "./ai";

/**
 * Opening rules from the classic Venezuelan school
 * ("regla de oro" of El Tigre de Carayaca).
 */
describe("chooseOpening", () => {
  it("leads the highest double that has company", () => {
    // 5-5 is higher, but 3-3 is the only double with company... 5-5 has none.
    const hand = ["3-3", "3-1", "3-6", "5-5", "0-2", "1-4", "2-6"];
    expect(chooseOpening(hand)).toBe("3-3");
  });

  it("prefers the higher double when both have company", () => {
    const hand = ["3-3", "3-1", "5-5", "5-2", "0-2", "1-4", "2-6"];
    expect(chooseOpening(hand)).toBe("5-5");
  });

  it("leads the highest bare double when none has company", () => {
    const hand = ["1-1", "5-5", "0-2", "3-4", "2-6", "4-6", "0-3"];
    expect(chooseOpening(hand)).toBe("5-5");
  });

  it("leads from the strongest suit when holding no doubles", () => {
    // Fives appear three times — lead a five, the heaviest of them.
    const hand = ["5-1", "5-2", "5-4", "0-1", "2-3", "3-4", "0-6"];
    expect(chooseOpening(hand)).toBe("5-4");
  });

  it("always returns a tile from the hand", () => {
    const hands = [
      ["6-6", "0-0", "1-2", "3-4", "5-6", "2-2", "0-4"],
      ["0-1", "1-2", "2-3", "3-4", "4-5", "5-6", "0-6"],
      ["4-4", "4-1", "4-5", "4-0", "2-3", "1-6", "0-5"],
    ];
    for (const hand of hands) expect(hand).toContain(chooseOpening(hand));
  });
});
