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
  MIN_DOUBLE_LIMIT,
  mustPass,
  newMatch,
  nextRound,
} from "@/engine/engine";
import { chooseMove } from "@/engine/ai";
import { manoAt } from "@/engine/roles";
import { recordMatch } from "./results";
import { recordRound } from "./roundStats";
import type { Difficulty } from "@/engine/ai";
import type { GameState, Move, Seat, TileId } from "@/engine/types";
import { RoomError } from "./types";
import type { ChatEntry, Player, PlayerView, Room, RoomStore, Watcher } from "./types";

const SEATS: Seat[] = [0, 1, 2, 3];

/** Seats as people refer to them at the table. */
const SEAT_NAME: Record<Seat, string> = {
  0: "South",
  1: "East",
  2: "North",
  3: "West",
};
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
/** A capicúa line: long enough to land, short enough to read at a glance. */
const MAX_TAUNT = 60;

/**
 * What to call whoever is in a seat.
 *
 * Computers are named by their seat rather than all sharing one word. With
 * three of them at the table, "Computer played 5|6" three times in a row tells
 * you nothing about who is doing what — and following the other players is most
 * of the game.
 */
export function nameOf(room: Room, seat: Seat): string {
  return room.players.find((p) => p.seat === seat)?.nickname ?? `Computer (${SEAT_NAME[seat]})`;
}

/**
 * Add a line to the table talk.
 *
 * The id has to be unique for the whole life of the room, because the browser
 * keys the rendered list on it. It used to be the timestamp plus the log's
 * length — which works until the log hits its cap, at which point the length is
 * always 120 and two entries written in the same millisecond collide. React
 * then renders one of them repeatedly, which is what filled the chat with the
 * same move fifteen times over.
 */
function say(
  room: Room,
  entry: { kind: ChatEntry["kind"]; seat: Seat | null; who: string; text: string }
): void {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  room.chat = [...(room.chat ?? []), { ...entry, id, at: Date.now() }].slice(-CHAT_LIMIT);
}

/** "6-3" reads better as "6|3" in a sentence. */
function tileText(id: TileId): string {
  return id.replace("-", "|");
}

/**
 * Say so when the lead changes hands.
 *
 * Passing does not lighten your hand, so a mano who passes stops being the
 * mano — the lead goes to whoever now holds the fewest tiles, and everyone's
 * job at the table changes with it. That is worth stating out loud.
 */
function announceLead(room: Room, before: GameState, after: GameState): void {
  if (after.roundOver) return;
  const was = manoAt(before.hands, before.opener);
  const now = manoAt(after.hands, after.opener);
  if (was === now) return;
  say(room, {
    kind: "event",
    seat: now,
    who: nameOf(room, now),
    text:
      before.lastAction?.kind === "pass"
        ? `${nameOf(room, was)} passed — ${nameOf(room, now)} takes the lead (mano)`
        : `${nameOf(room, now)} takes the lead (mano)`,
  });
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
  const how =
    r.kind === "domino"
      ? `${winner} dominoed${r.capicua ? " — capicúa!" : ""}`
      : `Blocked — ${winner}'s side was lighter`;
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

/**
 * Can this table's result count for anything?
 *
 * Only with four signed-in accounts. A rating says how you did against the
 * people you played — take one of them away and replace them with a guest or
 * a computer, and the expectation the result is measured against is a guess
 * about a stranger. Better to record nothing than to record noise.
 */
export function canBeRated(room: Room): boolean {
  return SEATS.every((seat) => {
    const player = room.players.find((p) => p.seat === seat);
    return Boolean(player?.userId);
  });
}

// ---------------------------------------------------------------- lobby

export interface CreateOptions {
  nickname: string;
  fillWithAi?: boolean;
  difficulty?: Difficulty;
  target?: number;
  maxDoubles?: number | null;
  rated?: boolean;
  random?: () => number;
  /** The account opening the table, if they were signed in. */
  userId?: string | null;
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
    maxDoubles: opts.maxDoubles ?? null,
    // On by default: four people who all signed in almost certainly want it to
    // count, and the host can say otherwise before the deal.
    rated: opts.rated ?? true,
    hostToken: token,
    players: [
      {
        seat: 0,
        nickname,
        token,
        connected: true,
        lastSeen: Date.now(),
        ready: false,
        wantsSeat: null,
        userId: opts.userId ?? null,
      },
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
  random: () => number = Math.random,
  userId: string | null = null
): Promise<{ room: Room; token: string }> {
  const room = await mustGet(store, code);
  if (room.status !== "lobby") throw new RoomError("That game has already started", 409);
  if (userId && (room.banned ?? []).includes(userId)) {
    throw new RoomError("The host removed you from this table", 403);
  }

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
    wantsSeat: null,
    userId,
  });
  say(room, { kind: "event", seat: open[0], who: "", text: `${name} sat down` });
  await save(store, room);
  return { room, token };
}

// ------------------------------------------------------------- watching

/** How many people can stand behind the players at once. */
const MAX_WATCHERS = 6;

function watcherOf(room: Room, token: string): Watcher | null {
  return (room.watchers ?? []).find((w) => w.token === token) ?? null;
}

function requireWatcher(room: Room, token: string): Watcher {
  const watcher = watcherOf(room, token);
  if (!watcher) throw new RoomError("You are not watching this room", 403);
  return watcher;
}

/**
 * Watch a table without taking a seat.
 *
 * Open whether or not the table is full, and whether or not the match has
 * started — turning up halfway through is the normal way anyone ends up
 * watching dominoes.
 *
 * An account is required. Consent to show a hand is given to a person, and a
 * guest nickname is not a person: anyone could type "Dresh" and be handed the
 * tiles the real Dresh was shown.
 */
export async function watchRoom(
  store: RoomStore,
  code: string,
  nickname: string,
  userId: string | null,
  random: () => number = Math.random
): Promise<{ room: Room; token: string }> {
  const room = await mustGet(store, code);
  if (!userId) throw new RoomError("Sign in to watch a table", 401);
  if ((room.banned ?? []).includes(userId)) {
    throw new RoomError("The host removed you from this table", 403);
  }
  if (room.players.some((p) => p.userId === userId)) {
    throw new RoomError("You are already playing at this table", 409);
  }

  const existing = (room.watchers ?? []).find((w) => w.userId === userId);
  if (existing) {
    // Same person on a new device or after a reload. Reuse the identity so the
    // consents they were given survive; a fresh token would quietly drop them.
    existing.connected = true;
    existing.lastSeen = Date.now();
    await save(store, room);
    return { room, token: existing.token };
  }

  if ((room.watchers ?? []).length >= MAX_WATCHERS) {
    throw new RoomError("Too many people are watching already", 409);
  }

  const token = makeToken(random);
  const watcher: Watcher = {
    id: makeToken(random).slice(0, 8),
    token,
    nickname: cleanNickname(nickname),
    userId,
    connected: true,
    lastSeen: Date.now(),
    allowed: [],
    asking: null,
  };
  room.watchers = [...(room.watchers ?? []), watcher];
  say(room, {
    kind: "event",
    seat: null,
    who: "",
    text: `${watcher.nickname} is watching`,
  });
  await save(store, room);
  return { room, token };
}

export async function stopWatching(
  store: RoomStore,
  code: string,
  token: string
): Promise<Room> {
  const room = await mustGet(store, code);
  const watcher = watcherOf(room, token);
  if (!watcher) return room;
  room.watchers = (room.watchers ?? []).filter((w) => w.token !== token);
  say(room, {
    kind: "event",
    seat: null,
    who: "",
    text: `${watcher.nickname} stopped watching`,
  });
  await save(store, room);
  return room;
}

/**
 * Ask one player to see their hand.
 *
 * A request, not a demand, and aimed at one person: there is no way to ask the
 * whole table at once, because there is no such thing as the table agreeing on
 * this. One open question at a time, so nobody can paper the room with them.
 */
export async function askToSee(
  store: RoomStore,
  code: string,
  token: string,
  seat: Seat
): Promise<Room> {
  const room = await mustGet(store, code);
  const watcher = requireWatcher(room, token);
  if (!isHuman(room, seat)) throw new RoomError("Nobody is sitting there", 409);
  if (watcher.allowed.includes(seat)) return room;

  watcher.asking = seat;
  say(room, {
    kind: "event",
    seat,
    who: "",
    text: `${watcher.nickname} asked ${nameOf(room, seat)} to see their hand`,
  });
  await save(store, room);
  return room;
}

/**
 * Answer a watcher's request — your own hand, your own decision.
 *
 * Only the player who was asked can answer. Not their partner, not the host:
 * this is the one thing at the table that is nobody else's to give.
 */
export async function answerLook(
  store: RoomStore,
  code: string,
  token: string,
  watcherId: string,
  allow: boolean
): Promise<Room> {
  const room = await mustGet(store, code);
  const player = requirePlayer(room, token);
  const watcher = (room.watchers ?? []).find((w) => w.id === watcherId);
  if (!watcher) throw new RoomError("Nobody is waiting on that", 409);
  if (watcher.asking !== player.seat) {
    throw new RoomError("They did not ask you", 403);
  }

  watcher.asking = null;
  if (allow && !watcher.allowed.includes(player.seat)) {
    watcher.allowed = [...watcher.allowed, player.seat];
  }
  say(room, {
    kind: "event",
    seat: player.seat,
    who: "",
    text: allow
      ? `${player.nickname} is showing ${watcher.nickname} their hand`
      : `${player.nickname} kept their hand to themselves`,
  });
  await save(store, room);
  return room;
}

/** Take it back. Allowed at any moment, without explaining why. */
export async function stopShowing(
  store: RoomStore,
  code: string,
  token: string,
  watcherId: string
): Promise<Room> {
  const room = await mustGet(store, code);
  const player = requirePlayer(room, token);
  const watcher = (room.watchers ?? []).find((w) => w.id === watcherId);
  if (!watcher) return room;
  if (!watcher.allowed.includes(player.seat)) return room;

  watcher.allowed = watcher.allowed.filter((s) => s !== player.seat);
  say(room, {
    kind: "event",
    seat: player.seat,
    who: "",
    text: `${player.nickname} is no longer showing ${watcher.nickname} their hand`,
  });
  await save(store, room);
  return room;
}

/**
 * Forget every consent.
 *
 * Called when a match starts. Agreeing to show your hand in one match is not
 * agreeing to show it in the next one, and a permission that quietly outlives
 * the thing it was given for is not really a permission.
 */
function clearConsents(room: Room): void {
  for (const watcher of room.watchers ?? []) {
    watcher.allowed = [];
    watcher.asking = null;
  }
}

/**
 * Sit somewhere else, so partners can arrange themselves across the table.
 *
 * An empty seat you simply take. An occupied one you have to ask for — see
 * `requestSwap`. Taking someone's seat out from under them changes who they
 * are partnered with, which is not a thing to do to somebody without asking.
 */
export async function takeSeat(
  store: RoomStore,
  code: string,
  token: string,
  seat: Seat
): Promise<Room> {
  const room = await mustGet(store, code);
  if (room.status !== "lobby") throw new RoomError("The game has already started", 409);
  const player = requirePlayer(room, token);
  if (player.seat === seat) return room;
  if (isHuman(room, seat)) {
    throw new RoomError("Someone is sitting there — ask them to swap", 409);
  }

  player.seat = seat;
  clearSwaps(room);
  say(room, {
    kind: "event",
    seat,
    who: player.nickname,
    text: `${player.nickname} moved to ${SEAT_NAME[seat]}`,
  });
  await save(store, room);
  return room;
}

/**
 * Remove someone from the table.
 *
 * The lobby only. Mid-match there is no good outcome: their seat either stalls
 * the game or is quietly handed to the computer, and either way the other three
 * lose the match they were playing. If someone has to go mid-game, finish or
 * return to the lobby first.
 */
export async function kickPlayer(
  store: RoomStore,
  code: string,
  token: string,
  seat: Seat
): Promise<Room> {
  const room = await mustGet(store, code);
  if (token !== room.hostToken) throw new RoomError("Only the host can do that", 403);
  if (room.status !== "lobby") {
    throw new RoomError("You can only do that before the match starts", 409);
  }

  const target = room.players.find((p) => p.seat === seat);
  if (!target) throw new RoomError("Nobody is sitting there", 409);
  if (target.token === room.hostToken) throw new RoomError("You cannot remove yourself");

  room.players = room.players.filter((p) => p.token !== target.token);

  // Only an account can actually be kept out. A guest can walk back in under
  // another nickname, and pretending otherwise would be worse than saying so.
  if (target.userId) {
    room.banned = [...new Set([...(room.banned ?? []), target.userId])];
  }

  clearSwaps(room);
  say(room, {
    kind: "event",
    seat: null,
    who: "",
    text: `${target.nickname} was removed from the table`,
  });
  await save(store, room);
  return room;
}

/** Nobody's outstanding request survives the seats moving underneath it. */
function clearSwaps(room: Room): void {
  for (const p of room.players) p.wantsSeat = null;
}

/**
 * Ask the player in `seat` to trade places.
 *
 * One outstanding request per person: asking somewhere else replaces the old
 * one, so nobody can paper the lobby with requests.
 */
export async function requestSwap(
  store: RoomStore,
  code: string,
  token: string,
  seat: Seat
): Promise<Room> {
  const room = await mustGet(store, code);
  if (room.status !== "lobby") throw new RoomError("The game has already started", 409);
  const player = requirePlayer(room, token);
  if (player.seat === seat) throw new RoomError("You are already sitting there");

  const sitting = room.players.find((p) => p.seat === seat && p.token !== token);
  if (!sitting) throw new RoomError("Nobody is sitting there — just take the seat", 409);

  player.wantsSeat = seat;
  say(room, {
    kind: "event",
    seat: player.seat,
    who: player.nickname,
    text: `${player.nickname} asked ${sitting.nickname} to swap seats`,
  });
  await save(store, room);
  return room;
}

/** Answer whoever asked for your seat. */
export async function respondSwap(
  store: RoomStore,
  code: string,
  token: string,
  accept: boolean
): Promise<Room> {
  const room = await mustGet(store, code);
  if (room.status !== "lobby") throw new RoomError("The game has already started", 409);
  const player = requirePlayer(room, token);

  const asker = room.players.find((p) => p.wantsSeat === player.seat);
  if (!asker) throw new RoomError("Nobody has asked for your seat", 409);

  asker.wantsSeat = null;

  if (!accept) {
    say(room, {
      kind: "event",
      seat: player.seat,
      who: player.nickname,
      text: `${player.nickname} would rather keep ${SEAT_NAME[player.seat]}`,
    });
    await save(store, room);
    return room;
  }

  const mine = player.seat;
  player.seat = asker.seat;
  asker.seat = mine;
  clearSwaps(room);
  say(room, {
    kind: "event",
    seat: asker.seat,
    who: asker.nickname,
    text: `${asker.nickname} and ${player.nickname} swapped seats`,
  });
  await save(store, room);
  return room;
}

export async function updateSettings(
  store: RoomStore,
  code: string,
  token: string,
  settings: {
    fillWithAi?: boolean;
    difficulty?: Difficulty;
    target?: number;
    maxDoubles?: number | null;
    rated?: boolean;
  }
): Promise<Room> {
  const room = await mustGet(store, code);
  if (token !== room.hostToken) throw new RoomError("Only the host can change settings", 403);
  // A match already dealt keeps the rule it was dealt under, so nobody can
  // change the terms between rounds.
  if (room.status !== "lobby") {
    throw new RoomError("You can only change the table's rules before the match starts", 409);
  }
  if (settings.fillWithAi !== undefined) room.fillWithAi = settings.fillWithAi;
  if (settings.difficulty) room.difficulty = settings.difficulty;
  if (settings.target) room.target = settings.target;
  if (settings.rated !== undefined && settings.rated !== (room.rated !== false)) {
    room.rated = settings.rated;
    say(room, {
      kind: "event",
      seat: null,
      who: "",
      text: settings.rated
        ? "Rated match — this one counts"
        : "Friendly — this one will not count toward ratings",
    });
  }
  if (settings.maxDoubles !== undefined) {
    const next = settings.maxDoubles === null ? null : Math.max(MIN_DOUBLE_LIMIT, settings.maxDoubles);
    if (next !== (room.maxDoubles ?? null)) {
      room.maxDoubles = next;
      say(room, {
        kind: "event",
        seat: null,
        who: "",
        text:
          next === null
            ? "House rule off: hands are dealt as they fall"
            : `House rule on: no hand starts with more than ${next} doubles`,
      });
    }
  }
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
  if (!player) {
    // Watchers ping too — it is how the table knows someone wandered off,
    // which matters when that someone can see a hand.
    const watcher = watcherOf(room, token);
    if (!watcher) return;
    const returning = !watcher.connected;
    watcher.connected = true;
    watcher.lastSeen = Date.now();
    if (returning) await save(store, room);
    return;
  }
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

  /*
   * Settle whether this counts, once, at the deal.
   *
   * Frozen here rather than worked out when the result is written: somebody
   * can drop out mid-match and be covered by the computer, and a match that
   * started rated should stay rated. It also means nobody can change the
   * terms after seeing how it is going.
   */
  if (room.rated !== false && !canBeRated(room)) {
    room.rated = false;
    say(room, {
      kind: "event",
      seat: null,
      who: "",
      text: "Friendly match — everyone needs an account for it to count toward ratings",
    });
  }

  room.status = "playing";
  // A new match asks the question again.
  clearConsents(room);
  room.game = newMatch(Math.random, room.target, room.maxDoubles ?? null);
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
  move: Move,
  taunt?: string
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

  // A line only survives if it was actually a capicúa. Anything else is just a
  // player typing into the void, and it never reaches the other seats.
  const line = (taunt ?? "").trim().slice(0, MAX_TAUNT);
  if (line && room.game.roundOver?.capicua) {
    room.game.roundOver.taunt = line;
    say(room, { kind: "chat", seat: player.seat, who: player.nickname, text: line });
  }

  say(room, {
    kind: "move",
    seat: player.seat,
    who: player.nickname,
    text: `played ${tileText(move.tileId)}`,
  });
  announceLead(room, game, room.game);
  announceRoundEnd(room, room.game);
  await recordRound(room, room.game);
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
  announceLead(room, game, room.game);
  announceRoundEnd(room, room.game);
  await recordRound(room, room.game);
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

/**
 * Back to the lobby for another match, with the same people in the same seats.
 *
 * Only once a match is actually over — this is a rematch, not a way to walk out
 * of a game somebody is losing.
 */
export async function returnToLobby(
  store: RoomStore,
  code: string,
  token: string
): Promise<Room> {
  const room = await mustGet(store, code);
  const player = requirePlayer(room, token);
  const game = requireGame(room);
  if (!game.matchOver) throw new RoomError("The match is still going", 409);

  room.status = "lobby";
  room.game = undefined;
  for (const p of room.players) {
    p.ready = false;
    p.wantsSeat = null;
  }

  say(room, {
    kind: "event",
    seat: player.seat,
    who: player.nickname,
    text: `${player.nickname} took the table back to the lobby — same seats, new match`,
  });
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
  const player = seatOf(room, token);
  const watcher = player ? null : watcherOf(room, token);
  if (!player && !watcher) throw new RoomError("You are not in this room", 403);

  const message = (text ?? "").trim().slice(0, MAX_CHAT_LENGTH);
  if (!message) throw new RoomError("Nothing to say");
  say(room, {
    kind: "chat",
    // No seat, so the line cannot be mistaken for a player's — someone
    // watching may well be able to see a hand, and what they say has to read
    // as coming from outside the game.
    seat: player ? player.seat : null,
    who: player ? player.nickname : `${watcher!.nickname} (watching)`,
    text: message,
  });
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
    const before = game;
    game = move ? applyMove(game, seat, move) : applyPass(game, seat);
    say(room, {
      kind: "move",
      seat,
      who: nameOf(room, seat),
      text: move ? `played ${tileText(move.tileId)}` : "passed",
    });
    announceLead(room, before, game);
    announceRoundEnd(room, game);
    await recordRound(room, game);
  }

  room.game = game;
  // Write the result down once, on the transition — every later call sees a
  // room that is already finished and does nothing.
  if (game.matchOver && room.status !== "finished") {
    room.status = "finished";
    await recordMatch(room, game);
  }
}

// ---------------------------------------------------------------- views

/**
 * Everything `token` is allowed to know. Other players' tiles never appear —
 * only how many they hold.
 */
export function viewFor(room: Room, token: string | null): PlayerView {
  const me = token ? seatOf(room, token) : null;
  // A token is one or the other, never both — you cannot watch a table you are
  // sitting at. Seat first, so a seated player is never treated as a watcher.
  const watcher = !me && token ? watcherOf(room, token) : null;
  const game = room.game;

  const seats = SEATS.map((seat) => {
    const player = room.players.find((p) => p.seat === seat);
    return {
      seat,
      nickname: player?.nickname ?? null,
      label: nameOf(room, seat),
      connected: player?.connected ?? false,
      isAi: !player || (!player.connected && room.fillWithAi),
      isYou: !!me && me.seat === seat,
      tilesLeft: game ? game.hands[seat].length : 0,
      ready: player?.ready ?? false,
      // Whether there is an account behind this seat, not which one. The table
      // needs to know a seat can be rated; nobody needs the id.
      account: Boolean(player?.userId),
    };
  });

  const swaps = room.players
    .filter((p) => p.wantsSeat !== null)
    .map((p) => ({ from: p.seat, to: p.wantsSeat as Seat }));

  return {
    code: room.code,
    status: room.status,
    version: room.version,
    you: me ? { seat: me.seat, nickname: me.nickname, isHost: me.token === room.hostToken } : null,
    watching: watcher ? { id: watcher.id, nickname: watcher.nickname } : null,
    // Tokens stay behind. Everything here is public by design: everyone at the
    // table should be able to see who is watching and what each of them has
    // been shown, including the watchers themselves.
    watchers: (room.watchers ?? []).map((w) => ({
      id: w.id,
      nickname: w.nickname,
      connected: w.connected,
      allowed: [...w.allowed],
      asking: w.asking,
    })),
    fillWithAi: room.fillWithAi,
    difficulty: room.difficulty,
    target: room.target,
    maxDoubles: room.maxDoubles ?? null,
    rated: room.rated !== false,
    canBeRated: canBeRated(room),
    seats,
    swaps,
    chat: room.chat ?? [],
    game:
      game && (me || watcher)
        ? {
            // A watcher holds nothing, and is shown only what they were given.
            hand: me ? [...game.hands[me.seat]] : [],
            ...(watcher
              ? {
                  shown: watcher.allowed.map((seat) => ({
                    seat,
                    hand: [...game.hands[seat]],
                  })),
                }
              : {}),
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
            // Nothing to play and nothing to be prompted about.
            legalMoves: me ? legalMoves(game, me.seat) : [],
            mustPass: me ? mustPass(game, me.seat) : false,
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
