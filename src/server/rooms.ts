/**
 * Server-side room logic.
 *
 * Every rule lives here, on top of the same engine the solo game uses. Browsers
 * only ever send intentions ("play this tile"); this module decides whether that
 * is legal, applies it, and hands back a view containing nothing the player is
 * not entitled to see.
 */

import {
  applyMove,
  applyPass,
  handPips,
  legalMoves,
  mustPass,
  newMatch,
  nextRound,
} from "@/engine/engine";
import { chooseMove } from "@/engine/ai";
import type { Difficulty } from "@/engine/ai";
import type { GameState, Move, Seat, TileId } from "@/engine/types";
import { RoomError } from "./types";
import type { ChatEntry, Player, PlayerView, Room, RoomStore } from "./types";

const SEATS: Seat[] = [0, 1, 2, 3];
/** No I, O, 0 or 1 — they get misread when people share a code out loud. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function makeToken(random: () => number = Math.random): string {
  return Array.from({ length: 4 }, () =>
    Math.floor(random() * 0xffffffff)
      .toString(36)
      .padStart(6, "0")
  ).join("");
}

function seatOf(room: Room, token: string): Player | null {
  return room.players.find((p) => p.token === token) ?? null;
}

/** Keep the tail of the conversation; nobody scrolls back further than this. */
const CHAT_LIMIT = 120;
const MAX_CHAT_LENGTH = 240;

export function nameOf(room: Room, seat: Seat): string {
  return room.players.find((p) => p.seat === seat)?.nickname ?? "Computer";
}

function say(
  room: Room,
  entry: { kind: ChatEntry["kind"]; seat: Seat | null; who: string; text: string }
): void {
  room.chat = [
    ...(room.chat ?? []),
    { ...entry, id: `${Date.now().toString(36)}-${room.chat?.length ?? 0}`, at: Date.now() },
  ].slice(-CHAT_LIMIT);
}

/** "6-3" reads better as "6|3" in a sentence. */
function tileText(id: TileId): string {
  return id.replace("-", "|");
}

/** Note the result of a round once it lands. */
function announceRoundEnd(room: Room, game: GameState): void {
  const r = game.roundOver;
  if (!r) return;
  if (r.kind === "tie") {
    say(room, { kind: "event", seat: null, who: "", text: "Blocked — dead tie, no score" });
    return;
  }
  const winner = r.winnerSeat !== null ? nameOf(room, r.winnerSeat) : "Nobody";
  const how = r.kind === "domino" ? `${winner} dominoed` : `Blocked — ${winner}'s side was lighter`;
  say(room, {
    kind: "event",
    seat: r.winnerSeat,
    who: "",
    text: `${how}, ${r.points} point${r.points === 1 ? "" : "s"}`,
  });
}

function requirePlayer(room: Room, token: string): Player {
  const player = seatOf(room, token);
  if (!player) throw new RoomError("You are not seated in this room", 403);
  return player;
}

function isHuman(room: Room, seat: Seat): boolean {
  return room.players.some((p) => p.seat === seat);
}

function freeSeats(room: Room): Seat[] {
  return SEATS.filter((s) => !isHuman(room, s));
}

// ---------------------------------------------------------------- lobby

export interface CreateOptions {
  nickname: string;
  fillWithAi?: boolean;
  difficulty?: Difficulty;
  target?: number;
  random?: () => number;
}

export async function createRoom(
  store: RoomStore,
  opts: CreateOptions
): Promise<{ room: Room; token: string }> {
  const nickname = cleanNickname(opts.nickname);
  const random = opts.random ?? Math.random;
  const token = makeToken(random);

  // Codes are short, so collisions are possible; try a few.
  let code = makeCode(random);
  for (let i = 0; i < 5 && (await store.get(code)); i++) code = makeCode(random);
  if (await store.get(code)) throw new RoomError("Could not allocate a room code", 503);

  const room: Room = {
    code,
    status: "lobby",
    fillWithAi: opts.fillWithAi ?? true,
    difficulty: opts.difficulty ?? "medium",
    target: opts.target ?? 100,
    hostToken: token,
    players: [
      { seat: 0, nickname, token, connected: true, lastSeen: Date.now(), ready: false },
    ],
    chat: [],
    version: 1,
    updatedAt: Date.now(),
  };
  say(room, { kind: "event", seat: 0, who: "", text: `${nickname} opened the table` });
  await store.create(room);
  return { room, token };
}

export async function joinRoom(
  store: RoomStore,
  code: string,
  nickname: string,
  random: () => number = Math.random
): Promise<{ room: Room; token: string }> {
  const room = await mustGet(store, code);
  if (room.status !== "lobby") throw new RoomError("That game has already started", 409);

  const open = freeSeats(room);
  if (open.length === 0) throw new RoomError("That room is full", 409);

  const token = makeToken(random);
  const name = cleanNickname(nickname);
  room.players.push({
    seat: open[0],
    nickname: name,
    token,
    connected: true,
    lastSeen: Date.now(),
    ready: false,
  });
  say(room, { kind: "event", seat: open[0], who: "", text: `${name} sat down` });
  await save(store, room);
  return { room, token };
}

/** Move yourself to a free seat, so partners can sit across from each other. */
export async function takeSeat(
  store: RoomStore,
  code: string,
  token: string,
  seat: Seat
): Promise<Room> {
  const room = await mustGet(store, code);
  if (room.status !== "lobby") throw new RoomError("The game has already started", 409);
  const player = requirePlayer(room, token);
  if (isHuman(room, seat) && player.seat !== seat) {
    throw new RoomError("That seat is taken", 409);
  }
  player.seat = seat;
  await save(store, room);
  return room;
}

export async function updateSettings(
  store: RoomStore,
  code: string,
  token: string,
  settings: { fillWithAi?: boolean; difficulty?: Difficulty; target?: number }
): Promise<Room> {
  const room = await mustGet(store, code);
  if (token !== room.hostToken) throw new RoomError("Only the host can change settings", 403);
  if (settings.fillWithAi !== undefined) room.fillWithAi = settings.fillWithAi;
  if (settings.difficulty) room.difficulty = settings.difficulty;
  if (settings.target) room.target = settings.target;
  await save(store, room);
  return room;
}

export async function leaveRoom(
  store: RoomStore,
  code: string,
  token: string
): Promise<Room> {
  const room = await mustGet(store, code);
  const player = seatOf(room, token);
  if (!player) return room;

  if (room.status === "lobby") {
    room.players = room.players.filter((p) => p.token !== token);
    // Hand the room to whoever is left rather than stranding it.
    if (token === room.hostToken && room.players.length > 0) {
      room.hostToken = room.players[0].token;
    }
  } else {
    // Mid-game, keep the seat so they can come back; the AI covers meanwhile.
    player.connected = false;
    player.ready = false;
    // Take over straight away, otherwise the table sits waiting on someone who
    // has already gone.
    if (room.fillWithAi) await advanceAi(room);

    // Walking out must not leave everyone else stuck on the scoreboard waiting
    // for a player who is no longer there.
    const game = room.game;
    if (game?.roundOver && !game.matchOver && waitingOn(room).length === 0) {
      return dealNextRound(store, room, game);
    }
  }
  await save(store, room);
  return room;
}

export async function heartbeat(
  store: RoomStore,
  code: string,
  token: string
): Promise<void> {
  const room = await store.get(code);
  if (!room) return;
  const player = seatOf(room, token);
  if (!player) return;
  const wasDisconnected = !player.connected;
  player.connected = true;
  player.lastSeen = Date.now();

  if (wasDisconnected) {
    // Coming back matters to everyone, so publish it.
    await save(store, room);
    return;
  }
  // A routine ping must never write the game back: the state we read may
  // already be stale, and rewriting it would undo somebody's move.
  await store.touchPlayer?.(room.code, token);
}

// ---------------------------------------------------------------- play

export async function startMatch(
  store: RoomStore,
  code: string,
  token: string
): Promise<Room> {
  const room = await mustGet(store, code);
  if (token !== room.hostToken) throw new RoomError("Only the host can start", 403);
  if (room.status === "playing") throw new RoomError("Already playing", 409);

  if (!room.fillWithAi && room.players.length < 4) {
    throw new RoomError("Waiting for four players — or switch on computer players", 409);
  }

  room.status = "playing";
  room.game = newMatch(Math.random, room.target);
  say(room, {
    kind: "event",
    seat: null,
    who: "",
    text: `Match on — ${nameOf(room, room.game.opener)} opens with the double six`,
  });
  await advanceAi(room);
  await save(store, room);
  return room;
}

export async function playMove(
  store: RoomStore,
  code: string,
  token: string,
  move: Move
): Promise<Room> {
  const room = await mustGet(store, code);
  const player = requirePlayer(room, token);
  const game = requireGame(room);

  if (game.currentSeat !== player.seat) throw new RoomError("It is not your turn", 409);
  if (game.roundOver || game.matchOver) throw new RoomError("The round is over", 409);

  const legal = legalMoves(game, player.seat);
  if (!legal.some((m) => m.tileId === move.tileId && m.end === move.end)) {
    throw new RoomError("That move is not legal", 422);
  }

  room.game = applyMove(game, player.seat, move);
  say(room, {
    kind: "move",
    seat: player.seat,
    who: player.nickname,
    text: `played ${tileText(move.tileId)}`,
  });
  announceRoundEnd(room, room.game);
  await advanceAi(room);
  await save(store, room);
  return room;
}

export async function playPass(
  store: RoomStore,
  code: string,
  token: string
): Promise<Room> {
  const room = await mustGet(store, code);
  const player = requirePlayer(room, token);
  const game = requireGame(room);

  if (game.currentSeat !== player.seat) throw new RoomError("It is not your turn", 409);
  if (!mustPass(game, player.seat)) throw new RoomError("You still have a legal move", 422);

  room.game = applyPass(game, player.seat);
  say(room, { kind: "move", seat: player.seat, who: player.nickname, text: "passed" });
  announceRoundEnd(room, room.game);
  await advanceAi(room);
  await save(store, room);
  return room;
}

/**
 * Who still has to say they are ready before the next round is dealt.
 *
 * Only people actually at the table count. Empty seats are computers, and
 * someone who has dropped should not hold the game up indefinitely.
 */
function waitingOn(room: Room): Player[] {
  return room.players.filter((p) => p.connected && !p.ready);
}

/**
 * Say you are done with the round on screen.
 *
 * The round only moves on once everybody still at the table has said so.
 * Reading the review takes as long as it takes, and nobody else's click should
 * pull it out from under you.
 */
export async function markReady(
  store: RoomStore,
  code: string,
  token: string,
  ready = true
): Promise<Room> {
  const room = await mustGet(store, code);
  const player = requirePlayer(room, token);
  const game = requireGame(room);
  if (!game.roundOver) throw new RoomError("The round is still going", 409);
  if (game.matchOver) throw new RoomError("The match is over", 409);

  if (player.ready === ready) return room; // already said so; nothing to do
  player.ready = ready;

  if (store.setReady) {
    // One column on one row. A whole-room write here would drop the other
    // player's flag whenever two people click at the same moment.
    await store.setReady(code, token, ready);
    await store.notify?.(code, room.version);
  } else {
    await save(store, room);
  }

  if (!ready) return room;

  // Re-read, so the decision is made on everyone's flags rather than the ones
  // we happened to arrive with.
  const fresh = store.setReady ? ((await store.get(code)) ?? room) : room;
  const freshGame = fresh.game;
  // Someone else may have completed the set while we were writing.
  if (!freshGame?.roundOver || freshGame.matchOver) return fresh;
  if (waitingOn(fresh).length > 0) return fresh;

  return dealNextRound(store, fresh, freshGame);
}

async function dealNextRound(
  store: RoomStore,
  room: Room,
  game: GameState
): Promise<Room> {
  room.game = nextRound(game);
  // The flags describe the round that just ended, so they go with it.
  for (const p of room.players) p.ready = false;
  say(room, {
    kind: "event",
    seat: null,
    who: "",
    text: `Round ${room.game.roundNumber} — ${nameOf(room, room.game.opener)} opens`,
  });
  await advanceAi(room);
  await save(store, room);
  return room;
}

/** A line of table talk from a seated player. */
export async function postChat(
  store: RoomStore,
  code: string,
  token: string,
  text: string
): Promise<Room> {
  const room = await mustGet(store, code);
  const player = requirePlayer(room, token);
  const message = (text ?? "").trim().slice(0, MAX_CHAT_LENGTH);
  if (!message) throw new RoomError("Nothing to say");
  say(room, { kind: "chat", seat: player.seat, who: player.nickname, text: message });
  await save(store, room);
  return room;
}

/**
 * Play out every seat the computer is responsible for, until it is a present
 * human's turn again. A seat is the computer's if nobody is sitting there, or
 * if the player who was sitting there has dropped and the room allows AI cover.
 */
async function advanceAi(room: Room): Promise<void> {
  let game: GameState | undefined = room.game;
  if (!game) return;

  for (let guard = 0; guard < 60; guard++) {
    if (game.roundOver || game.matchOver) break;
    const seat: Seat = game.currentSeat;
    const player = room.players.find((p) => p.seat === seat);
    const computerControlled = !player || (!player.connected && room.fillWithAi);
    if (!computerControlled) break;
    if (!player && !room.fillWithAi) break; // nobody can move; wait for a human

    const move = chooseMove(game, seat, { difficulty: room.difficulty });
    game = move ? applyMove(game, seat, move) : applyPass(game, seat);
    say(room, {
      kind: "move",
      seat,
      who: nameOf(room, seat),
      text: move ? `played ${tileText(move.tileId)}` : "passed",
    });
    announceRoundEnd(room, game);
  }

  room.game = game;
  if (game.matchOver) room.status = "finished";
}

// ---------------------------------------------------------------- views

/**
 * Everything `token` is allowed to know. Other players' tiles never appear —
 * only how many they hold.
 */
export function viewFor(room: Room, token: string | null): PlayerView {
  const me = token ? seatOf(room, token) : null;
  const game = room.game;

  const seats = SEATS.map((seat) => {
    const player = room.players.find((p) => p.seat === seat);
    return {
      seat,
      nickname: player?.nickname ?? null,
      connected: player?.connected ?? false,
      isAi: !player || (!player.connected && room.fillWithAi),
      isYou: !!me && me.seat === seat,
      tilesLeft: game ? game.hands[seat].length : 0,
      ready: player?.ready ?? false,
    };
  });

  return {
    code: room.code,
    status: room.status,
    version: room.version,
    you: me ? { seat: me.seat, nickname: me.nickname, isHost: me.token === room.hostToken } : null,
    fillWithAi: room.fillWithAi,
    difficulty: room.difficulty,
    target: room.target,
    seats,
    chat: room.chat ?? [],
    game:
      game && me
        ? {
            hand: [...game.hands[me.seat]],
            line: game.line,
            leftEnd: game.leftEnd,
            rightEnd: game.rightEnd,
            currentSeat: game.currentSeat,
            roundNumber: game.roundNumber,
            matchScore: game.matchScore,
            opener: game.opener,
            mustOpenWithDoubleSix: game.mustOpenWithDoubleSix,
            roundOver: game.roundOver,
            matchOver: game.matchOver,
            lastAction: game.lastAction,
            legalMoves: legalMoves(game, me.seat),
            mustPass: mustPass(game, me.seat),
            // Each history entry carries a snapshot of *all four* hands, which
            // is exactly what the review needs and exactly what an opponent
            // must never see. Only send it once the round is over and the
            // tiles are no longer secret.
            history: game.roundOver ? game.history : [],
            // Same rule: only once the round has finished.
            revealed: game.roundOver
              ? (game.hands.map((h) => [...h]) as [string[], string[], string[], string[]])
              : null,
          }
        : null,
  };
}

/** Spectator-safe summary, used by the lobby before you have a seat. */
export function lobbyView(room: Room): PlayerView {
  return viewFor(room, null);
}

// ---------------------------------------------------------------- helpers

async function mustGet(store: RoomStore, code: string): Promise<Room> {
  const room = await store.get(normaliseCode(code));
  if (!room) throw new RoomError("No room with that code", 404);
  return room;
}

function requireGame(room: Room): GameState {
  if (!room.game) throw new RoomError("The match has not started", 409);
  return room.game;
}

async function save(store: RoomStore, room: Room): Promise<void> {
  room.version += 1;
  room.updatedAt = Date.now();
  await store.put(room);
  await store.notify?.(room.code, room.version);
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

function cleanNickname(raw: string): string {
  const name = (raw ?? "").trim().slice(0, 16);
  if (!name) throw new RoomError("Pick a nickname first");
  return name;
}

/** Pip totals, for showing the damage when a round ends. */
export function roundPips(game: GameState): [number, number, number, number] {
  return game.hands.map(handPips) as [number, number, number, number];
}
