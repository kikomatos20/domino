import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "./memoryStore";
import {
  beginNextRound,
  createRoom,
  joinRoom,
  leaveRoom,
  playMove,
  playPass,
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
    // And cannot pinch an occupied one.
    await expect(takeSeat(store, room.code, joined.token, 0)).rejects.toThrow(/taken/i);
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
      await beginNextRound(store, code, tokens[1]);
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
