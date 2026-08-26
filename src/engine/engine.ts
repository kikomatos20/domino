// Double-six partner dominoes engine.
// 4 players, 2 teams, 7 tiles each (full 28-tile deal, no boneyard), score to 100.
// Pure functions over GameState — designed to run client-side now and server-side later.

import type {
  End,
  GameState,
  Move,
  MoveRecord,
  PlacedTile,
  RoundResult,
  Seat,
  Snapshot,
  Team,
  Tile,
  TileId,
} from "./types";

export const TARGET_SCORE = 100;

// ---------- tiles ----------

export function tileId(t: Tile): TileId {
  return `${t.a}-${t.b}`;
}

export function parseTile(id: TileId): Tile {
  const [a, b] = id.split("-").map(Number);
  return { a, b };
}

export function allTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push({ a, b });
  return tiles; // 28
}

export function tilePips(id: TileId): number {
  const { a, b } = parseTile(id);
  return a + b;
}

export function isDouble(id: TileId): boolean {
  const { a, b } = parseTile(id);
  return a === b;
}

export function handPips(hand: TileId[]): number {
  return hand.reduce((s, id) => s + tilePips(id), 0);
}

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

// ---------- setup ----------

export type Rng = () => number;

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal(rng: Rng): [TileId[], TileId[], TileId[], TileId[]] {
  const ids = shuffle(allTiles().map(tileId), rng);
  return [ids.slice(0, 7), ids.slice(7, 14), ids.slice(14, 21), ids.slice(21, 28)];
}

/** Start a brand-new match (round 1: holder of 6-6 opens with it). */
export function newMatch(rng: Rng = Math.random, target = TARGET_SCORE): GameState {
  const hands = deal(rng);
  const opener = hands.findIndex((h) => h.includes("6-6")) as Seat;
  return {
    hands,
    line: [],
    leftEnd: null,
    rightEnd: null,
    currentSeat: opener,
    consecutivePasses: 0,
    roundNumber: 1,
    opener,
    mustOpenWithDoubleSix: true,
    matchScore: [0, 0],
    target,
    roundOver: null,
    matchOver: false,
    lastAction: null,
    history: [],
    passedOn: [[], [], [], []],
  };
}

/**
 * Deal the next round.
 *
 * Only the very first round is opened by the holder of the double six. After
 * that the opening passes round the table in playing order — the next opener is
 * the player to the right of the last one, continuing counter-clockwise.
 */
export function nextRound(state: GameState, rng: Rng = Math.random): GameState {
  if (!state.roundOver || state.matchOver) {
    throw new Error("nextRound: round is not over or match is finished");
  }
  const opener: Seat = nextSeat(state.opener);
  return {
    ...state,
    hands: deal(rng),
    line: [],
    leftEnd: null,
    rightEnd: null,
    currentSeat: opener,
    consecutivePasses: 0,
    roundNumber: state.roundNumber + 1,
    opener,
    mustOpenWithDoubleSix: false,
    roundOver: null,
    lastAction: null,
    history: [],
    passedOn: [[], [], [], []],
  };
}

// ---------- moves ----------

/** Freeze the current position so a move can be re-analyzed later. */
function snapshot(state: GameState): Snapshot {
  return {
    hands: state.hands.map((h) => [...h]) as Snapshot["hands"],
    line: state.line.map((t) => ({ ...t })),
    leftEnd: state.leftEnd,
    rightEnd: state.rightEnd,
    passedOn: state.passedOn.map((p) => [...p]) as Snapshot["passedOn"],
    mustOpenWithDoubleSix: state.mustOpenWithDoubleSix,
  };
}

/** Rebuild a playable position from a snapshot, to analyze `seat`'s options. */
export function stateFromSnapshot(
  before: Snapshot,
  seat: Seat,
  target = TARGET_SCORE
): GameState {
  return {
    hands: before.hands.map((h) => [...h]) as GameState["hands"],
    line: before.line.map((t) => ({ ...t })),
    leftEnd: before.leftEnd,
    rightEnd: before.rightEnd,
    currentSeat: seat,
    consecutivePasses: 0,
    roundNumber: 1,
    opener: seat,
    mustOpenWithDoubleSix: before.mustOpenWithDoubleSix,
    matchScore: [0, 0],
    target,
    roundOver: null,
    matchOver: false,
    lastAction: null,
    history: [],
    passedOn: before.passedOn.map((p) => [...p]) as GameState["passedOn"],
  };
}

export function legalMoves(state: GameState, seat: Seat): Move[] {
  if (state.roundOver || state.matchOver || seat !== state.currentSeat) return [];
  const hand = state.hands[seat];

  // Opening move.
  if (state.line.length === 0) {
    if (state.mustOpenWithDoubleSix) {
      return hand.includes("6-6") ? [{ tileId: "6-6", end: "right" }] : [];
    }
    return hand.map((tileId) => ({ tileId, end: "right" as End }));
  }

  const moves: Move[] = [];
  for (const id of hand) {
    const { a, b } = parseTile(id);
    if (a === state.leftEnd || b === state.leftEnd) moves.push({ tileId: id, end: "left" });
    if (a === state.rightEnd || b === state.rightEnd) moves.push({ tileId: id, end: "right" });
  }
  return moves;
}

export function mustPass(state: GameState, seat: Seat): boolean {
  return (
    !state.roundOver &&
    !state.matchOver &&
    seat === state.currentSeat &&
    legalMoves(state, seat).length === 0
  );
}

export function applyMove(state: GameState, seat: Seat, move: Move): GameState {
  const legal = legalMoves(state, seat);
  if (!legal.some((m) => m.tileId === move.tileId && m.end === move.end)) {
    throw new Error(`Illegal move: seat ${seat} tile ${move.tileId} end ${move.end}`);
  }

  const record: MoveRecord = { seat, kind: "play", move, before: snapshot(state) };

  const { a, b } = parseTile(move.tileId);
  const hand = state.hands[seat].filter((id) => id !== move.tileId);
  const hands = [...state.hands] as GameState["hands"];
  hands[seat] = hand;

  let line: PlacedTile[];
  let leftEnd: number;
  let rightEnd: number;

  if (state.line.length === 0) {
    line = [{ left: a, right: b, seat, opening: true }];
    leftEnd = a;
    rightEnd = b;
  } else if (move.end === "left") {
    const e = state.leftEnd as number;
    const placed: PlacedTile = a === e ? { left: b, right: a, seat } : { left: a, right: b, seat };
    line = [placed, ...state.line];
    leftEnd = placed.left;
    rightEnd = state.rightEnd as number;
  } else {
    const e = state.rightEnd as number;
    const placed: PlacedTile = a === e ? { left: a, right: b, seat } : { left: b, right: a, seat };
    line = [...state.line, placed];
    leftEnd = state.leftEnd as number;
    rightEnd = placed.right;
  }

  const next: GameState = {
    ...state,
    hands,
    line,
    leftEnd,
    rightEnd,
    consecutivePasses: 0,
    currentSeat: nextSeat(seat),
    lastAction: { seat, kind: "play", move },
    history: [...state.history, record],
  };

  if (hand.length === 0) {
    return endRound(next, {
      kind: "domino",
      winnerSeat: seat,
      // Judged against the position *before* the tile landed.
      capicua: isCapicua(state, move),
    });
  }

  // Tranca check: ends only change when a tile is played, so if nobody at the
  // table can match either end right now, the round is dead — end it immediately
  // instead of making all four players pass in turn.
  const anyoneCanPlay = hands.some((h) =>
    h.some((id) => {
      const t = parseTile(id);
      return t.a === leftEnd || t.b === leftEnd || t.a === rightEnd || t.b === rightEnd;
    })
  );
  if (!anyoneCanPlay) return endRound(next, { kind: "blocked" });

  return next;
}

export function applyPass(state: GameState, seat: Seat): GameState {
  if (!mustPass(state, seat)) {
    throw new Error(`Seat ${seat} cannot pass: has legal moves or not their turn`);
  }
  const passedOn = state.passedOn.map((p, i) =>
    i === seat
      ? [...new Set([...p, state.leftEnd as number, state.rightEnd as number])]
      : p
  ) as GameState["passedOn"];

  const next: GameState = {
    ...state,
    passedOn,
    consecutivePasses: state.consecutivePasses + 1,
    currentSeat: nextSeat(seat),
    lastAction: { seat, kind: "pass" },
    history: [...state.history, { seat, kind: "pass", before: snapshot(state) }],
  };

  if (next.consecutivePasses >= 4) return endRound(next, { kind: "blocked" });
  return next;
}

// ---------- round & match resolution ----------

/**
 * A capicúa: going out on a tile that fitted both ends, the ends being
 * different numbers. Both ends showing the same suit means there was only ever
 * one number in play, so it does not count; nor can a double, for the same
 * reason. No points attach to it here — it is recognised, not rewarded.
 */
export function isCapicua(state: GameState, move: Move): boolean {
  if (state.line.length === 0) return false;
  const { a, b } = parseTile(move.tileId);
  if (a === b) return false;
  const left = state.leftEnd as number;
  const right = state.rightEnd as number;
  if (left === right) return false;
  return (a === left && b === right) || (a === right && b === left);
}

function endRound(
  state: GameState,
  cause:
    | { kind: "domino"; winnerSeat: Seat; capicua?: boolean }
    | { kind: "blocked" }
): GameState {
  const pips = state.hands.map(handPips) as RoundResult["pips"];
  const teamPips: [number, number] = [pips[0] + pips[2], pips[1] + pips[3]];

  let result: RoundResult;
  if (cause.kind === "domino") {
    const team = teamOf(cause.winnerSeat);
    result = {
      kind: "domino",
      winningTeam: team,
      winnerSeat: cause.winnerSeat,
      points: teamPips[(1 - team) as Team],
      pips,
      capicua: cause.capicua ?? false,
    };
  } else if (teamPips[0] === teamPips[1]) {
    result = { kind: "tie", winningTeam: null, winnerSeat: null, points: 0, pips };
  } else {
    const team: Team = teamPips[0] < teamPips[1] ? 0 : 1;
    // Opener for next round: the winning-team player with the lighter hand.
    const [s1, s2]: Seat[] = team === 0 ? [0, 2] : [1, 3];
    const winnerSeat = pips[s1] <= pips[s2] ? s1 : s2;
    result = {
      kind: "blocked",
      winningTeam: team,
      winnerSeat,
      points: teamPips[(1 - team) as Team],
      pips,
    };
  }

  const matchScore: [number, number] = [...state.matchScore];
  if (result.winningTeam !== null) matchScore[result.winningTeam] += result.points;

  return {
    ...state,
    matchScore,
    roundOver: result,
    matchOver: matchScore[0] >= state.target || matchScore[1] >= state.target,
  };
}

/**
 * The play that ended the round, and the two ends it landed between.
 *
 * Only meaningful once a round is over. Used to show what a capicúa actually
 * was — which tile, and which two numbers it joined — since that is the whole
 * content of the thing.
 */
export function closingPlay(
  history: MoveRecord[]
): { seat: Seat; tileId: TileId; ends: [number, number] } | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i];
    if (record.kind !== "play" || !record.move) continue;
    const { leftEnd, rightEnd } = record.before;
    if (leftEnd === null || rightEnd === null) return null;
    return { seat: record.seat, tileId: record.move.tileId, ends: [leftEnd, rightEnd] };
  }
  return null;
}

/** Convenience: winner of the match, if over. */
export function matchWinner(state: GameState): Team | null {
  if (!state.matchOver) return null;
  return state.matchScore[0] >= state.target ? 0 : 1;
}
