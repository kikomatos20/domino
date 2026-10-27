import { describe, expect, it } from "vitest";
import { shortLabel } from "./OnlineTable";

describe("seat chip labels", () => {
  it("shortens computer seats", () => {
    expect(shortLabel("Computer (West)")).toBe("West (bot)");
    expect(shortLabel("Computer (North)")).toBe("North (bot)");
  });
  it("leaves people's names alone", () => {
    expect(shortLabel("Kiko")).toBe("Kiko");
    expect(shortLabel("Computer fan")).toBe("Computer fan");
  });
});
