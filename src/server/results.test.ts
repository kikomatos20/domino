import { describe, expect, it } from "vitest";
import { againstPeople } from "./results";

describe("what counts as a game against people", () => {
  it("needs someone else actually at the table", () => {
    expect(againstPeople({ humans: 2 })).toBe(true);
    expect(againstPeople({ humans: 4 })).toBe(true);
  });

  it("does not count a private room you filled with computers", () => {
    // The loophole: a room code alone used to make this an "online" win, so
    // you could pad the record against the easy computer.
    expect(againstPeople({ humans: 1 })).toBe(false);
  });

  it("treats an unknown count as solo rather than flattering it", () => {
    expect(againstPeople({})).toBe(false);
    expect(againstPeople({ humans: null })).toBe(false);
  });
});
