import { describe, expect, it } from "vitest";
import { addressFor, normaliseUsername } from "./accounts";

describe("usernames", () => {
  it("treats one name as one person however it is typed", () => {
    expect(normaliseUsername("  Kiko ")).toBe("kiko");
    expect(normaliseUsername("KIKO")).toBe("kiko");
    expect(addressFor("Kiko")).toBe(addressFor("kiko"));
  });

  it("maps to an address that can never receive anything", () => {
    // RFC 2606 reserves .invalid precisely so nobody mistakes it for real mail.
    expect(addressFor("babo")).toMatch(/\.invalid$/);
    expect(addressFor("babo")).toBe("babo@players.domino.invalid");
  });

  it("gives different people different addresses", () => {
    expect(addressFor("kiko")).not.toBe(addressFor("babo"));
  });
});
