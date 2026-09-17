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
  /**
   * The account behind this seat, if they were signed in when they sat down.
   * Null for guests, which stays the normal case — an account only decides
   * whether the result gets written down.
   */
  userId?: string | null;
}

/**
 * Somebody watching without a seat.
 *
 * A watcher sees the table, the score and the talk — the same things anyone
 * standing behind the players would see. A hand is not one of those things. To
 * see one they have to ask that player, and that player decides. Nobody at the
 * table can grant it on their partner's behalf, and the host cannot grant it
 * for everyone: it is each player's own hand to show or keep.
 */
export interface Watcher {
  /**
   * Public name for this watcher, safe to send to everyone.
   *
   * Separate from the token because a seated player has to be able to answer
   * "Dresh wants to see your hand", which means addressing a watcher by name
   * in a request — and the token is a credential, not an address.
   */
  id: string;
  token: string;
  nickname: string;
  /**
   * Watching takes an account. Not for the game's sake — for the players': a
   * hand shown to a guest is a hand shown to a name anyone can type, and
   * consent given to nobody in particular is not consent.
   */
  userId: string;
  connected: boolean;
  lastSeen: number;
  /** Seats that have agreed to let this watcher see their hand. */
  allowed: Seat[];
  /** A seat they have asked and are waiting on, if any. One at a time. */
  asking: Seat | null;
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
  /**
   * House rule: the most doubles anyone may be dealt, or null to play the
   * shuffle as it falls. Not a rule of dominoes — a table agreement some
   * groups keep, which is why the host decides it per match.
   */
  maxDoubles?: number | null;
  /**
   * Whether this match counts toward everyone's rating.
   *
   * Only meaningful with four accounts at the table. What a result is worth
   * depends on who you played with and who you played against, and a guest has
   * no rating to reckon with — so a table with one is a friendly, whatever the
   * host would prefer. Set false at the deal when the seats do not qualify.
   */
  rated?: boolean;
  hostToken: string;
  players: Player[];
  /** People watching without a seat. */
  watchers?: Watcher[];
  /** Absent until the host starts the match. */
  game?: GameState;
  /** Table talk and the run of play, oldest first. */
  chat: ChatEntry[];
  /**
   * Accounts the host has removed. Only signed-in players can be kept out —
   * a guest has nothing stable to recognise them by, so a kick is a request
   * to leave rather than a lock on the door.
   */
  banned?: string[];
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
  /**
   * You are watching rather than playing. `you` stays null — a watcher has no
   * seat — so this is what tells the interface apart from a stranger reading
   * the lobby.
   */
  watching?: { id: string; nickname: string } | null;
  /**
   * Who is watching, and where each of them stands with each player. Everyone
   * sees this, players and watchers alike: being watched is not something to
   * find out afterwards.
   */
  watchers?: {
    id: string;
    nickname: string;
    connected: boolean;
    /** Seats that agreed to show this watcher their hand. */
    allowed: Seat[];
    /** A seat they have asked and are waiting on. */
    asking: Seat | null;
  }[];
  fillWithAi: boolean;
  difficulty: Difficulty;
  target: number;
  maxDoubles?: number | null;
  /** The host wants this to count. */
  rated?: boolean;
  /** Whether it actually can — every seat an account. */
  canBeRated?: boolean;
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
    /**
     * Someone signed in is sitting here. Not who — just that the seat can
     * carry a result, which is what makes a match ratable.
     */
    account: boolean;
    /**
     * Their rating, when they are signed in and have played. Filled in for the
     * lobby only — see `withRatings` — so it is absent during a match.
     */
    rating?: number;
    provisional?: boolean;
  }[];
  /** Outstanding seat swap requests, from one seat to another. Lobby only. */
  swaps: { from: Seat; to: Seat }[];
  chat: ChatEntry[];
  game: {
    /** Only ever your own tiles. Empty for a watcher, who holds none. */
    hand: string[];
    /**
     * Hands a watcher has been shown, by the players who chose to show them.
     * Absent for everyone else, and never populated from anything but that
     * watcher's own list of consents.
     */
    shown?: { seat: Seat; hand: string[] }[];
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
