import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "./memoryStore";
import {
  createRoom,
  joinRoom,
  kickPlayer,
  leaveRoom,
  markReady,
  playMove,
  playPass,
  postChat,
  requestSwap,
  respondSwap,
  startMatch,
  takeSeat,
  updateSettings,
  viewFor,
} from "./rooms";
import { RoomError } from "./types";
import type { Room, RoomStore } from "./types";
import type { Seat } from "@/engine/types";

let store: ReturnType<typeof createMemoryStore>;

beforeEach(() => {
  store = createMemoryStore();
});

/** A room with four humans seated. */
async function fourPlayers(): Promise<{ code: string; tokens: string[] }> {
  const { room, token } = await createRoom(store, { nickname: "Kiko" });
  const tokens = [token];
  for (const name of ["Ana", "Beto", "Caro"]) {
    tokens.push((await joinRoom(store, room.code, name)).token);
  }
  return { code: room.code, tokens };
}

async function get(code: string): Promise<Room> {
  const room = await store.get(code);
  if (!room) throw new Error("room vanished");
  return room;
}

function seatReady(room: Room, token: string): boolean {
  return room.players.find((p) => p.token === token)?.ready ?? false;
}

/** Whoever's turn it is, played by their own token. */
async function playCurrent(code: string, tokens: string[]): Promise<void> {
  const room = await get(code);
  const seat = room.game!.currentSeat;
  const player = room.players.find((p) => p.seat === seat)!;
  const view = viewFor(room, player.token);
  if (view.game!.mustPass) await playPass(store, code, player.token);
  else await playMove(store, code, player.token, view.game!.legalMoves[0]);
  void tokens;
}

describe("lobby", () => {
  it("creates a room with a shareable code and seats the host", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko" });
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.players).toHaveLength(1);
    expect(room.hostToken).toBe(token);
    expect(viewFor(room, token).you).toMatchObject({ seat: 0, isHost: true });
  });

  it("seats joiners and rejects a fifth", async () => {
    const { code } = await fourPlayers();
    await expect(joinRoom(store, code, "Extra")).rejects.toThrow(/full/i);
    const room = await get(code);
    expect(room.players.map((p) => p.seat).sort()).toEqual([0, 1, 2, 3]);
  });

  it("is case-insensitive about codes", async () => {
    const { room } = await createRoom(store, { nickname: "Kiko" });
    await expect(joinRoom(store, room.code.toLowerCase(), "Ana")).resolves.toBeTruthy();
  });

  it("lets players swap to a free seat so partners can sit across", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko" });
    const joined = await joinRoom(store, room.code, "Ana");
    await takeSeat(store, room.code, joined.token, 2);
    const after = await get(room.code);
    expect(after.players.find((p) => p.nickname === "Ana")!.seat).toBe(2);
    // And cannot pinch an occupied one — that has to be asked for.
    await expect(takeSeat(store, room.code, joined.token, 0)).rejects.toThrow(
      /ask them to swap/i
    );
    void token;
  });

  it("only lets the host change settings or start", async () => {
    const { room } = await createRoom(store, { nickname: "Kiko" });
    const guest = await joinRoom(store, room.code, "Ana");
    await expect(
      updateSettings(store, room.code, guest.token, { difficulty: "hard" })
    ).rejects.toThrow(/host/i);
    await expect(startMatch(store, room.code, guest.token)).rejects.toThrow(/host/i);
  });

  it("hands the room to someone else if the host leaves in the lobby", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko" });
    const guest = await joinRoom(store, room.code, "Ana");
    await leaveRoom(store, room.code, token);
    const after = await get(room.code);
    expect(after.hostToken).toBe(guest.token);
    expect(after.players).toHaveLength(1);
  });
});

describe("starting", () => {
  it("refuses to start short-handed when computer players are off", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko", fillWithAi: false });
    await expect(startMatch(store, room.code, token)).rejects.toThrow(/four players/i);
  });

  it("fills the empty seats with the computer when allowed", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko", fillWithAi: true });
    await startMatch(store, room.code, token);
    const view = viewFor(await get(room.code), token);
    expect(view.status).toBe("playing");
    expect(view.seats.filter((s) => s.isAi)).toHaveLength(3);
    // The computers have already played up to the human's turn.
    expect(view.game!.currentSeat).toBe(0);
  });

  it("deals seven tiles to everyone and opens with the double six", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    const room = await get(code);
    expect(room.game!.hands.every((h) => h.length === 7)).toBe(true);
    expect(room.game!.hands[room.game!.opener]).toContain("6-6");
  });
});

describe("hidden information", () => {
  it("never reveals another player's tiles", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    const room = await get(code);

    for (const token of tokens) {
      const view = viewFor(room, token);
      const seat = view.you!.seat;
      expect(view.game!.hand).toEqual(room.game!.hands[seat]);

      // No other hand may appear anywhere in the payload.
      const serialised = JSON.stringify(view);
      for (const other of [0, 1, 2, 3] as Seat[]) {
        if (other === seat) continue;
        for (const tile of room.game!.hands[other]) {
          // A tile can legitimately appear if it is also in your own hand or
          // already on the table; neither is true straight after the deal.
          expect(serialised).not.toContain(`"${tile}"`);
        }
      }
    }
  });

  it("does not leak hands through the move history mid-round", async () => {
    // Every history entry snapshots all four hands. It must stay server-side
    // until the round is over and the tiles stop being secret.
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    for (let i = 0; i < 6; i++) {
      const room = await get(code);
      if (room.game!.roundOver) break;
      await playCurrent(code, tokens);
    }

    const room = await get(code);
    expect(room.game!.history.length).toBeGreaterThan(0); // the server has it

    for (const token of tokens) {
      const view = viewFor(room, token);
      const seat = view.you!.seat;
      expect(view.game!.history).toEqual([]); // the player does not

      const serialised = JSON.stringify(view);
      const onTable = new Set(
        room.game!.line.map((t) => `${Math.min(t.left, t.right)}-${Math.max(t.left, t.right)}`)
      );
      for (const other of [0, 1, 2, 3] as Seat[]) {
        if (other === seat) continue;
        for (const tile of room.game!.hands[other]) {
          if (onTable.has(tile)) continue;
          expect(serialised).not.toContain(`"${tile}"`);
        }
      }
    }
  });

  it("releases the history for review once the round is over", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    for (let i = 0; i < 200; i++) {
      const room = await get(code);
      if (room.game!.roundOver) break;
      await playCurrent(code, tokens);
    }
    const view = viewFor(await get(code), tokens[0]);
    expect(view.game!.roundOver).not.toBeNull();
    expect(view.game!.history.length).toBeGreaterThan(0);
  });

  it("shows how many tiles everyone holds, but nothing more", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    const view = viewFor(await get(code), tokens[1]);
    expect(view.seats.map((s) => s.tilesLeft)).toEqual([7, 7, 7, 7]);
    expect(view.seats.filter((s) => s.isYou)).toHaveLength(1);
  });

  it("gives a spectator no hand at all", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    const view = viewFor(await get(code), null);
    expect(view.you).toBeNull();
    expect(view.game).toBeNull();
  });
});

describe("turn enforcement", () => {
  it("rejects a move from the wrong player", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    const room = await get(code);
    const wrongSeat = ((room.game!.currentSeat + 1) % 4) as Seat;
    const wrong = room.players.find((p) => p.seat === wrongSeat)!;
    const theirView = viewFor(room, wrong.token);
    await expect(
      playMove(store, code, wrong.token, { tileId: theirView.game!.hand[0], end: "right" })
    ).rejects.toThrow(/not your turn/i);
  });

  it("rejects a tile the player does not hold", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    const room = await get(code);
    const onTurn = room.players.find((p) => p.seat === room.game!.currentSeat)!;
    const notMine = (["6-5", "4-3", "2-1"] as string[]).find(
      (t) => !room.game!.hands[onTurn.seat].includes(t)
    )!;
    await expect(
      playMove(store, code, onTurn.token, { tileId: notMine, end: "right" })
    ).rejects.toThrow(/not legal/i);
  });

  it("rejects a stranger's token entirely", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    await expect(
      playMove(store, code, "not-a-real-token", { tileId: "6-6", end: "right" })
    ).rejects.toThrow(RoomError);
  });

  it("refuses a pass when a legal move exists", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    const room = await get(code);
    const onTurn = room.players.find((p) => p.seat === room.game!.currentSeat)!;
    if (!viewFor(room, onTurn.token).game!.mustPass) {
      await expect(playPass(store, code, onTurn.token)).rejects.toThrow(/legal move/i);
    }
  });
});

describe("a full round with four humans", () => {
  it("plays to the end of a round and can start the next", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);

    for (let i = 0; i < 200; i++) {
      const room = await get(code);
      if (room.game!.roundOver) break;
      await playCurrent(code, tokens);
    }

    const room = await get(code);
    expect(room.game!.roundOver).not.toBeNull();
    const scored = room.game!.matchScore[0] + room.game!.matchScore[1];
    expect(scored).toBeGreaterThanOrEqual(0);

    if (!room.game!.matchOver) {
      for (const token of tokens) await markReady(store, code, token);
      const next = await get(code);
      expect(next.game!.roundNumber).toBe(2);
      expect(next.game!.roundOver).toBeNull();
      // The opening passes round the table.
      expect(next.game!.opener).toBe(((room.game!.opener + 1) % 4) as Seat);
    }
  });

  it("bumps the version on every action so clients notice", async () => {
    const { code, tokens } = await fourPlayers();
    const before = (await get(code)).version;
    await startMatch(store, code, tokens[0]);
    const after = (await get(code)).version;
    expect(after).toBeGreaterThan(before);
  });
});

describe("disconnections", () => {
  it("lets the computer cover a dropped player and hands the seat back", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);

    const room = await get(code);
    const seat = room.game!.currentSeat;
    const player = room.players.find((p) => p.seat === seat)!;

    await leaveRoom(store, code, player.token);
    const dropped = await get(code);
    // Seat kept, marked away, and the game did not stall on them.
    expect(dropped.players.find((p) => p.token === player.token)!.connected).toBe(false);
    expect(dropped.game!.currentSeat).not.toBe(seat);

    const view = viewFor(dropped, player.token);
    expect(view.seats[seat].isAi).toBe(true);
    expect(view.you!.seat).toBe(seat); // they can still come back
  });

  it("stalls rather than cheating when computer cover is switched off", async () => {
    const { code, tokens } = await fourPlayers();
    await updateSettings(store, code, tokens[0], { fillWithAi: false });
    await startMatch(store, code, tokens[0]);

    const room = await get(code);
    const seat = room.game!.currentSeat;
    const player = room.players.find((p) => p.seat === seat)!;
    await leaveRoom(store, code, player.token);

    const after = await get(code);
    expect(after.game!.currentSeat).toBe(seat); // waits for them to return
  });
});

describe("the host clearing a seat", () => {
  it("removes them and frees the seat", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko" });
    const ana = await joinRoom(store, room.code, "Ana");
    const seat = (await get(room.code)).players.find((p) => p.token === ana.token)!.seat;

    await kickPlayer(store, room.code, token, seat);

    const after = await get(room.code);
    expect(after.players.map((p) => p.nickname)).toEqual(["Kiko"]);
    // The seat is open again, so somebody else can take it.
    expect(after.players.some((p) => p.seat === seat)).toBe(false);
  });

  it("only the host can do it", async () => {
    const { room } = await createRoom(store, { nickname: "Kiko" });
    const ana = await joinRoom(store, room.code, "Ana");
    await joinRoom(store, room.code, "Beto");
    await expect(kickPlayer(store, room.code, ana.token, 0)).rejects.toBeInstanceOf(
      RoomError
    );
  });

  it("refuses once the match has started", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    // Mid-match there is no good outcome: the seat either stalls the table or
    // is handed to the computer, and the other three lose their game either way.
    await expect(kickPlayer(store, code, tokens[0], 1)).rejects.toBeInstanceOf(RoomError);
  });

  it("will not let the host remove themselves", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko" });
    await expect(kickPlayer(store, room.code, token, 0)).rejects.toBeInstanceOf(RoomError);
  });

  it("keeps a signed-in player out afterwards", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko" });
    await joinRoom(store, room.code, "Ana", undefined, "user-ana");
    await kickPlayer(store, room.code, token, 1);

    await expect(
      joinRoom(store, room.code, "Ana", undefined, "user-ana")
    ).rejects.toBeInstanceOf(RoomError);
    // A different account is unaffected.
    await expect(
      joinRoom(store, room.code, "Beto", undefined, "user-beto")
    ).resolves.toBeTruthy();
  });

  it("cannot keep a guest out, and does not pretend to", async () => {
    // Nothing stable identifies a guest, so this is honest rather than fixed:
    // a kicked guest holding the code can walk back in.
    const { room, token } = await createRoom(store, { nickname: "Kiko" });
    await joinRoom(store, room.code, "Ana");
    await kickPlayer(store, room.code, token, 1);
    await expect(joinRoom(store, room.code, "Ana")).resolves.toBeTruthy();
  });

  it("says so at the table", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko" });
    await joinRoom(store, room.code, "Ana");
    await kickPlayer(store, room.code, token, 1);
    const said = (await get(room.code)).chat.map((c) => c.text).join(" | ");
    expect(said).toMatch(/Ana was removed/);
  });
});

describe("accounts at the table", () => {
  it("remembers which seats belong to an account and which are guests", async () => {
    const { room } = await createRoom(store, { nickname: "Kiko", userId: "user-kiko" });
    await joinRoom(store, room.code, "Ana", undefined, "user-ana");
    await joinRoom(store, room.code, "Guest");

    const after = await get(room.code);
    const by = (name: string) => after.players.find((p) => p.nickname === name)!;
    expect(by("Kiko").userId).toBe("user-kiko");
    expect(by("Ana").userId).toBe("user-ana");
    // A nickname-only player is exactly as welcome, and simply not recorded.
    expect(by("Guest").userId ?? null).toBeNull();
  });

  it("keeps the account attached to the person when seats move", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko", userId: "user-kiko" });
    const ana = (await joinRoom(store, room.code, "Ana", undefined, "user-ana")).token;

    await requestSwap(store, room.code, token, 1);
    await respondSwap(store, room.code, ana, true);

    const after = await get(room.code);
    // They changed chairs, not identities.
    expect(after.players.find((p) => p.token === token)!.userId).toBe("user-kiko");
    expect(after.players.find((p) => p.token === ana)!.userId).toBe("user-ana");
  });

  it("never exposes an account id to the other players", async () => {
    const { room, token } = await createRoom(store, { nickname: "Kiko", userId: "user-kiko" });
    const ana = (await joinRoom(store, room.code, "Ana", undefined, "user-ana")).token;

    // Whole payload, not just the fields we happen to read.
    const raw = JSON.stringify(viewFor(await get(room.code), ana));
    expect(raw).not.toContain("user-kiko");
    expect(raw).not.toContain("user-ana");
    void token;
  });
});

describe("saying something on a capicua", () => {
  /** A room whose next play by seat 0 closes on both ends. */
  async function aboutToCapicua() {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    const room = await get(code);
    room.game = {
      ...room.game!,
      hands: [["3-5"], ["3-6"], ["2-2"], ["1-1"]],
      line: [
        { left: 3, right: 4, seat: 1 },
        { left: 4, right: 5, seat: 2 },
      ],
      leftEnd: 3,
      rightEnd: 5,
      currentSeat: 0,
      history: [],
    };
    await store.put(room);
    return { code, tokens };
  }

  it("carries the line to everyone when the tile closes both ends", async () => {
    const { code, tokens } = await aboutToCapicua();
    await playMove(store, code, tokens[0], { tileId: "3-5", end: "right" }, "both ends, friend");

    const view = viewFor(await get(code), tokens[1]);
    expect(view.game!.roundOver).toMatchObject({ capicua: true, taunt: "both ends, friend" });
    // And it lands in the chat, so it survives the moment passing.
    expect(view.chat.some((c) => c.text === "both ends, friend")).toBe(true);
  });

  it("drops the line when the move was not a capicua", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    const room = await get(code);
    const seat = room.game!.currentSeat;
    const player = room.players.find((p) => p.seat === seat)!;
    const move = viewFor(room, player.token).game!.legalMoves[0];

    await playMove(store, code, player.token, move, "nothing to see here");
    const chat = (await get(code)).chat;
    // A player typing into the void reaches nobody.
    expect(chat.some((c) => c.text === "nothing to see here")).toBe(false);
  });

  it("keeps the line short enough to read", async () => {
    const { code, tokens } = await aboutToCapicua();
    await playMove(store, code, tokens[0], { tileId: "3-5", end: "right" }, "x".repeat(500));
    const taunt = (await get(code)).game!.roundOver!.taunt!;
    expect(taunt.length).toBeLessThanOrEqual(60);
  });

  it("says nothing at all when nothing was typed", async () => {
    const { code, tokens } = await aboutToCapicua();
    await playMove(store, code, tokens[0], { tileId: "3-5", end: "right" });
    const over = (await get(code)).game!.roundOver!;
    expect(over.capicua).toBe(true);
    expect(over.taunt).toBeUndefined();
  });
});

describe("swapping seats in the lobby", () => {
  async function two() {
    const { room, token } = await createRoom(store, { nickname: "Kiko" });
    const ana = (await joinRoom(store, room.code, "Ana")).token;
    return { code: room.code, kiko: token, ana };
  }

  const seatOf = async (code: string, token: string) =>
    (await get(code)).players.find((p) => p.token === token)!.seat;

  it("takes an empty seat without asking anyone", async () => {
    const { code, kiko } = await two();
    await takeSeat(store, code, kiko, 2);
    expect(await seatOf(code, kiko)).toBe(2);
  });

  it("refuses to take a seat somebody is sitting in", async () => {
    const { code, kiko, ana } = await two();
    const anaSeat = await seatOf(code, ana);
    await expect(takeSeat(store, code, kiko, anaSeat)).rejects.toBeInstanceOf(RoomError);
    // Nobody moved.
    expect(await seatOf(code, ana)).toBe(anaSeat);
  });

  it("swaps only once the other player agrees", async () => {
    const { code, kiko, ana } = await two();
    const kikoSeat = await seatOf(code, kiko);
    const anaSeat = await seatOf(code, ana);

    await requestSwap(store, code, kiko, anaSeat);
    // Asking on its own changes nothing.
    expect(await seatOf(code, kiko)).toBe(kikoSeat);
    expect(await seatOf(code, ana)).toBe(anaSeat);

    // Ana sees the request against her own seat.
    const view = viewFor(await get(code), ana);
    expect(view.swaps).toEqual([{ from: kikoSeat, to: anaSeat }]);

    await respondSwap(store, code, ana, true);
    expect(await seatOf(code, kiko)).toBe(anaSeat);
    expect(await seatOf(code, ana)).toBe(kikoSeat);
    // And the request is spent.
    expect(viewFor(await get(code), ana).swaps).toEqual([]);
  });

  it("leaves everyone where they are on a refusal", async () => {
    const { code, kiko, ana } = await two();
    const kikoSeat = await seatOf(code, kiko);
    const anaSeat = await seatOf(code, ana);

    await requestSwap(store, code, kiko, anaSeat);
    await respondSwap(store, code, ana, false);

    expect(await seatOf(code, kiko)).toBe(kikoSeat);
    expect(await seatOf(code, ana)).toBe(anaSeat);
    expect(viewFor(await get(code), ana).swaps).toEqual([]);
  });

  it("only lets the person being asked answer", async () => {
    const { code, tokens } = await fourPlayers();
    await requestSwap(store, code, tokens[0], 2);
    // Seat 1 was not asked, so there is nothing for them to accept.
    await expect(respondSwap(store, code, tokens[1], true)).rejects.toBeInstanceOf(
      RoomError
    );
  });

  it("keeps one request per person, so the lobby cannot be papered", async () => {
    const { code, tokens } = await fourPlayers();
    await requestSwap(store, code, tokens[0], 1);
    await requestSwap(store, code, tokens[0], 2);
    const view = viewFor(await get(code), tokens[0]);
    expect(view.swaps).toEqual([{ from: 0, to: 2 }]);
  });

  it("drops stale requests when the seats move underneath them", async () => {
    const { code, tokens } = await fourPlayers();
    await requestSwap(store, code, tokens[1], 2);
    // Seat 3 leaves, and seat 0 moves into the gap.
    await leaveRoom(store, code, tokens[3]);
    await takeSeat(store, code, tokens[0], 3);
    expect(viewFor(await get(code), tokens[1]).swaps).toEqual([]);
  });

  it("will not rearrange the table once the match has started", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    await expect(requestSwap(store, code, tokens[0], 1)).rejects.toBeInstanceOf(RoomError);
    await expect(takeSeat(store, code, tokens[0], 1)).rejects.toBeInstanceOf(RoomError);
  });

  it("says in the chat who swapped with whom", async () => {
    const { code, kiko, ana } = await two();
    await requestSwap(store, code, kiko, await seatOf(code, ana));
    await respondSwap(store, code, ana, true);
    const said = (await get(code)).chat.map((c) => c.text).join(" | ");
    expect(said).toMatch(/Kiko asked Ana to swap/);
    expect(said).toMatch(/swapped seats/);
  });
});

describe("readying up between rounds", () => {
  /** Play a room until the current round finishes. */
  async function playOutRound(code: string, tokens: string[]): Promise<void> {
    for (let i = 0; i < 60; i++) {
      const room = await get(code);
      if (room.game!.roundOver) return;
      await playCurrent(code, tokens);
    }
    throw new Error("round never finished");
  }

  async function finishedRound() {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    await playOutRound(code, tokens);
    return { code, tokens };
  }

  it("does not deal the next round until everyone has said they are ready", async () => {
    const { code, tokens } = await finishedRound();
    const before = (await get(code)).game!.roundNumber;
    if ((await get(code)).game!.matchOver) return;

    for (const token of tokens.slice(0, 3)) {
      await markReady(store, code, token);
      // Three of four is not enough — the fourth may still be reading.
      expect((await get(code)).game!.roundNumber).toBe(before);
      expect((await get(code)).game!.roundOver).not.toBeNull();
    }

    await markReady(store, code, tokens[3]);
    const after = await get(code);
    expect(after.game!.roundNumber).toBe(before + 1);
    expect(after.game!.roundOver).toBeNull();
  });

  it("keeps the finished round's history readable while people are still reading", async () => {
    const { code, tokens } = await finishedRound();
    if ((await get(code)).game!.matchOver) return;

    await markReady(store, code, tokens[0]);
    // The player who has not readied can still see the round they just played.
    const view = viewFor(await get(code), tokens[3]);
    expect(view.game!.roundOver).not.toBeNull();
    expect(view.game!.history.length).toBeGreaterThan(0);
    expect(view.game!.revealed).not.toBeNull();
  });

  it("lets you take it back if you readied too soon", async () => {
    const { code, tokens } = await finishedRound();
    if ((await get(code)).game!.matchOver) return;
    const before = (await get(code)).game!.roundNumber;

    await markReady(store, code, tokens[0]);
    await markReady(store, code, tokens[0], false);
    expect(seatReady(await get(code), tokens[0])).toBe(false);

    // Everyone else readying is now not enough.
    for (const token of tokens.slice(1)) await markReady(store, code, token);
    expect((await get(code)).game!.roundNumber).toBe(before);

    await markReady(store, code, tokens[0]);
    expect((await get(code)).game!.roundNumber).toBe(before + 1);
  });

  it("clears the flags for the new round", async () => {
    const { code, tokens } = await finishedRound();
    if ((await get(code)).game!.matchOver) return;
    for (const token of tokens) await markReady(store, code, token);
    const after = await get(code);
    expect(after.players.every((p) => !p.ready)).toBe(true);
  });

  it("does not wait on someone who has left the table", async () => {
    const { code, tokens } = await finishedRound();
    if ((await get(code)).game!.matchOver) return;
    const before = (await get(code)).game!.roundNumber;

    for (const token of tokens.slice(0, 3)) await markReady(store, code, token);
    expect((await get(code)).game!.roundNumber).toBe(before);

    // The fourth walks out rather than readying — the table moves on.
    await leaveRoom(store, code, tokens[3]);
    expect((await get(code)).game!.roundNumber).toBe(before + 1);
  });

  it("refuses to ready while the round is still being played", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    await expect(markReady(store, code, tokens[0])).rejects.toBeInstanceOf(RoomError);
  });

  it("keeps both flags when two people ready at the same moment", async () => {
    const { code, tokens } = await finishedRound();
    if ((await get(code)).game!.matchOver) return;

    await Promise.all([
      markReady(store, code, tokens[0]),
      markReady(store, code, tokens[1]),
    ]);

    // A whole-room write would have let the slower one overwrite the faster.
    expect(seatReady(await get(code), tokens[0])).toBe(true);
    expect(seatReady(await get(code), tokens[1])).toBe(true);
  });

  it("says who is ready in the view, so the table can see what it is waiting for", async () => {
    const { code, tokens } = await finishedRound();
    if ((await get(code)).game!.matchOver) return;
    await markReady(store, code, tokens[1]);
    const view = viewFor(await get(code), tokens[0]);
    const ready = view.seats.filter((s) => s.ready).map((s) => s.nickname);
    expect(ready).toEqual(["Ana"]);
  });
});

describe("table chat", () => {
  it("carries the run of play alongside what people say", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    await playCurrent(code, tokens);

    await postChat(store, code, tokens[1], "nice one");

    const view = viewFor(await get(code), tokens[1]);
    const kinds = view.chat.map((c) => c.kind);
    expect(kinds).toContain("event"); // sat down, match on
    expect(kinds).toContain("move"); // the tile that was just played
    expect(view.chat.at(-1)).toMatchObject({ kind: "chat", text: "nice one", seat: 1 });

    // Moves name the tile, so "nice one" still makes sense later.
    const move = view.chat.find((c) => c.kind === "move")!;
    expect(move.text).toMatch(/played \d\|\d/);
  });

  it("refuses empty messages and trims long ones", async () => {
    const { code, tokens } = await fourPlayers();
    const before = (await get(code)).chat.length;

    await expect(postChat(store, code, tokens[0], "   ")).rejects.toBeInstanceOf(RoomError);
    await postChat(store, code, tokens[0], "x".repeat(500));

    const chat = (await get(code)).chat;
    expect(chat.length).toBe(before + 1);
    expect(chat.at(-1)!.text.length).toBeLessThanOrEqual(240);
  });

  it("does not let a stranger post to a room they are not in", async () => {
    const { code } = await fourPlayers();
    await expect(postChat(store, code, "not-a-token", "hey")).rejects.toBeInstanceOf(
      RoomError
    );
  });

  it("keeps the log bounded so the room row stays small", async () => {
    const { code, tokens } = await fourPlayers();
    for (let i = 0; i < 140; i++) await postChat(store, code, tokens[0], `msg ${i}`);
    const chat = (await get(code)).chat;
    expect(chat.length).toBeLessThanOrEqual(120);
    expect(chat.at(-1)!.text).toBe("msg 139");
  });

  it("says nothing about hands — chat is visible to everyone", async () => {
    const { code, tokens } = await fourPlayers();
    await startMatch(store, code, tokens[0]);
    for (let i = 0; i < 6; i++) await playCurrent(code, tokens);

    const room = await get(code);
    const hands = room.game!.hands.flat();
    const said = viewFor(room, tokens[0])
      .chat.map((c) => c.text)
      .join(" ");
    for (const id of hands) {
      const [a, b] = id.split("-");
      expect(said).not.toContain(`${a}|${b}`);
    }
  });
});

describe("store contract", () => {
  it("notifies subscribers whenever the room changes", async () => {
    const pings: number[] = [];
    const wrapped: RoomStore = {
      ...store,
      notify: async (_code, version) => {
        pings.push(version);
      },
    };
    const { room, token } = await createRoom(wrapped, { nickname: "Kiko" });
    await joinRoom(wrapped, room.code, "Ana");
    await startMatch(wrapped, room.code, token);
    expect(pings.length).toBeGreaterThanOrEqual(2);
    expect(pings).toEqual([...pings].sort((a, b) => a - b));
  });
});
