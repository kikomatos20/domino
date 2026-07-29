// Pure types for the domino engine. No UI or platform dependencies.

/** Canonical tile: a <= b. Id is `${a}-${b}`. */
export interface Tile {
  a: number;
  b: number;
}

export type TileId = string;

/** Seats go counter-clockwise. 0 = South (human), 1 = East, 2 = North (partner), 3 = West. */
export type Seat = 0 | 1 | 2 | 3;

/** Team 0 = seats 0 & 2 ("Us"), Team 1 = seats 1 & 3 ("Them"). */
export type Team = 0 | 1;

export type End = "left" | "right";

export interface Move {
  tileId: TileId;
  end: End;
}

/** A tile as displayed on the line, left-to-right. */
export interface PlacedTile {
  left: number;
  right: number;
  seat: Seat;
  /** True for the round's opening tile — rendered oriented toward its player. */
  opening?: boolean;
}

export interface RoundResult {
  kind: "domino" | "blocked" | "tie";
  winningTeam: Team | null;
  winnerSeat: Seat | null;
  points: number;
  /** Pip totals per seat at round end. */
  pips: [number, number, number, number];
}

export interface LastAction {
  seat: Seat;
  kind: "play" | "pass";
  move?: Move;
}

/** Everything needed to re-analyze a position after the fact. */
export interface Snapshot {
  hands: [TileId[], TileId[], TileId[], TileId[]];
  line: PlacedTile[];
  leftEnd: number | null;
  rightEnd: number | null;
  passedOn: [number[], number[], number[], number[]];
  mustOpenWithDoubleSix: boolean;
}

export interface MoveRecord {
  seat: Seat;
  kind: "play" | "pass";
  move?: Move;
  /** Position as it stood just before this action. */
  before: Snapshot;
}

export interface GameState {
  hands: [TileId[], TileId[], TileId[], TileId[]];
  line: PlacedTile[];
  leftEnd: number | null;
  rightEnd: number | null;
  currentSeat: Seat;
  consecutivePasses: number;
  roundNumber: number;
  opener: Seat;
  /** Round 1 only: opener must play the 6-6. */
  mustOpenWithDoubleSix: boolean;
  matchScore: [number, number];
  target: number;
  roundOver: RoundResult | null;
  matchOver: boolean;
  lastAction: LastAction | null;
  /** Every action taken this round, for post-round review. */
  history: MoveRecord[];
  /** passedOn[seat] = end values that seat has passed on this round (public info). */
  passedOn: [number[], number[], number[], number[]];
}
