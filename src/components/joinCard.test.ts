import { describe, expect, it } from "vitest";
import { openSeats, seatedNames } from "./RoomClient";

const seat = (nickname: string | null, isAi = false) => ({ nickname, isAi }) as never;

describe("the join-by-link card", () => {
  it("names the people at the table and counts the computers", () => {
    expect(seatedNames({ seats: [seat("Kiko"), seat(null, true), seat("Ale"), seat(null, true)] })).toBe(
      "Kiko, Ale and 2 computer players"
    );
    expect(seatedNames({ seats: [seat("Kiko"), seat(null), seat(null), seat(null)] })).toBe("Kiko");
  });

  it("counts seats a newcomer can take, computer seats included", () => {
    expect(openSeats({ seats: [seat("Kiko"), seat(null, true), seat("Ale"), seat(null)] })).toBe(2);
    expect(openSeats({ seats: [seat("A"), seat("B"), seat("C"), seat("D")] })).toBe(0);
  });
});
