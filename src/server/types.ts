import type { Difficulty } from "@/engine/ai";
import type { GameState, Move, Seat } from "@/engine/types";

export type RoomStatus = "lobby" | "playing" | "finished";

export interface Player {
  seat: Seat;
  nickname: string;
  token: string;
  connected: boolean;
  lastSeen: number;
  /**
   * Said they are done looking at the round that just finished. Cleared when
   * the next round is dealt, so it always refers to the round on screen.
   */
  ready: boolean;
  /**
   * A seat this player has asked to trade for, pending the occupant's answer.
   * At most one at a time, and cleared whenever the seats actually move.
   */
  wantsSeat: Seat | null;
}

/**
 * One line in the table talk.
 *
 * Chat and the run of play share a single stream on purpose: "nice tile" reads
 * very differently three moves later, and separating them loses the thread.
 */
export interface ChatEntry {
  id: string;
  kind: "chat" | "move" | "event";
  seat: Seat | null;
  who: string;
  text: string;
  at: number;
}

export interface Room {
  code: string;
  status: RoomStatus;
  fillWithAi: boolean;
  difficulty: Difficulty;
  target: number;
  hostToken: string;
  players: Player[];
  /** Absent until the host starts the match. */
  game?: GameState;
  /** Table talk and the run of play, oldest first. */
  chat: ChatEntry[];
  version: number;
  updatedAt: number;
}

/** Anything that can persist rooms. Postgres in production, a map in tests. */
export interface RoomStore {
  get(code: string): Promise<Room | null>;
  put(room: Room): Promise<void>;
  create(room: Room): Promise<void>;
  /** Tell everyone in the room that something changed. */
  notify?(code: string, version: number): Promise<void>;
  /**
   * Record that a player is still present, without touching game state.
   * Kept separate from `put` so a heartbeat can never overwrite a move.
   */
  touchPlayer?(code: string, token: string): Promise<void>;
  /**
   * Flag one player ready, without rewriting the room.
   *
   * Two people clicking Ready at the same moment would otherwise race through
   * a whole-room write and one of the two flags would be lost.
   */
  setReady?(code: string, token: string, ready: boolean): Promise<void>;
}

/** What a single player is allowed to see. */
export interface PlayerView {
  code: string;
  status: RoomStatus;
  version: number;
  you: { seat: Seat; nickname: string; isHost: boolean } | null;
  fillWithAi: boolean;
  difficulty: Difficulty;
  target: number;
  seats: {
    seat: Seat;
    nickname: string | null;
    /**
     * What to call this seat out loud. A nickname if someone is there, and
     * otherwise the computer named by its seat — three players all called
     * "Computer" makes the move log useless.
     */
    label: string;
    connected: boolean;
    isAi: boolean;
    isYou: boolean;
    tilesLeft: number;
    /** Ready for the next round. Meaningless while a round is in progress. */
    ready: boolean;
  }[];
  /** Outstanding seat swap requests, from one seat to another. Lobby only. */
  swaps: { from: Seat; to: Seat }[];
  chat: ChatEntry[];
  game: {
    /** Only ever your own tiles. */
    hand: string[];
    line: GameState["line"];
    leftEnd: number | null;
    rightEnd: number | null;
    currentSeat: Seat;
    roundNumber: number;
    matchScore: [number, number];
    opener: Seat;
    mustOpenWithDoubleSix: boolean;
    roundOver: GameState["roundOver"];
    matchOver: boolean;
    lastAction: GameState["lastAction"];
    legalMoves: Move[];
    mustPass: boolean;
    /** Your own history only, so the round review still works online. */
    history: GameState["history"];
    /**
     * Everyone's leftover tiles, once the round is over and they are no longer
     * secret. Null while the round is still being played.
     */
    revealed: [string[], string[], string[], string[]] | null;
  } | null;
}

export class RoomError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}
