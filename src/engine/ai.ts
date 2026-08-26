// AI for partner dominoes.
//
// Plays only on public information: its own hand, the tiles on the table, and
// what each player has passed on. On "hard" it reasons the way a good club
// player does — tracking who is void in what, developing its own suits, keeping
// its partner alive, squeezing opponents onto suits they cannot answer, chasing
// outstanding doubles, and dumping weight when the round looks like it will
// close.

import {
  allTiles,
  isCapicua,
  isDouble,
  legalMoves,
  parseTile,
  teamOf,
  tileId,
  tilePips,
} from "./engine";
import { manoAt, roleOf } from "./roles";
import type { End, GameState, Move, Seat, TileId } from "./types";

/** Where the round has got to. Different phases reward different things. */
export type Phase = "opening" | "early" | "middle" | "end";

export function phaseOf(state: GameState, handSize: number): Phase {
  if (state.line.length === 0) return "opening";
  if (handSize <= 3) return "end";
  if (state.line.length <= 6) return "early";
  return "middle";
}

export type Difficulty = "easy" | "medium" | "hard";

export interface AiOptions {
  difficulty?: Difficulty;
  /** Disable the tie-breaking jitter, so analysis is repeatable. */
  deterministic?: boolean;
}

export interface ScoredMove {
  move: Move;
  score: number;
  /** Plain-language notes on why this move scored the way it did. */
  reasons: string[];
}

// ---------- reading the table ----------

export interface Knowledge {
  /** How many tiles of each suit `seat` holds. */
  suitCount: number[];
  /** Suits each seat is known to be void in (they passed on them). */
  voids: [Set<number>, Set<number>, Set<number>, Set<number>];
  /** Tiles not on the table and not in `seat`'s hand — split among the others. */
  unseen: TileId[];
  /** Of the unseen tiles, how many show each suit. */
  unseenSuit: number[];
  /** Doubles still unaccounted for, by suit. */
  outstandingDoubles: Set<number>;
  /** Tiles left in the other three hands. */
  tilesOut: number;
  /**
   * Suits nobody else can possibly answer: every tile showing that number is
   * either on the table or in your own hand. Knowing a suit is dead is what
   * turns a hopeful block into a certain one.
   */
  deadSuits: Set<number>;
  /** Pips still off the table, split between the three hidden hands. */
  unseenPips: number;
  /** What you are carrying right now. */
  myPips: number;
}

export function readTable(state: GameState, seat: Seat): Knowledge {
  const hand = state.hands[seat];

  const suitCount = new Array(7).fill(0);
  for (const id of hand) {
    const { a, b } = parseTile(id);
    suitCount[a]++;
    if (b !== a) suitCount[b]++;
  }

  const played = new Set<TileId>();
  for (const t of state.line) {
    played.add(tileId({ a: Math.min(t.left, t.right), b: Math.max(t.left, t.right) }));
  }

  const mine = new Set(hand);
  const unseen = allTiles()
    .map(tileId)
    .filter((id) => !played.has(id) && !mine.has(id));

  const unseenSuit = new Array(7).fill(0);
  const outstandingDoubles = new Set<number>();
  for (const id of unseen) {
    const { a, b } = parseTile(id);
    unseenSuit[a]++;
    if (b !== a) unseenSuit[b]++;
    else outstandingDoubles.add(a);
  }

  const voids = [0, 1, 2, 3].map(
    (s) => new Set(state.passedOn[s as Seat])
  ) as Knowledge["voids"];

  const tilesOut = state.hands.reduce(
    (n, h, i) => (i === seat ? n : n + h.length),
    0
  );

  // A suit is dead when none of it is unaccounted for. Everything showing that
  // number is on the table or in this hand, so no opponent can answer it.
  const deadSuits = new Set<number>();
  for (let suit = 0; suit <= 6; suit++) {
    if (unseenSuit[suit] === 0) deadSuits.add(suit);
  }

  const unseenPips = unseen.reduce((sum, id) => sum + tilePips(id), 0);
  const myPips = hand.reduce((sum, id) => sum + tilePips(id), 0);

  return {
    suitCount,
    voids,
    unseen,
    unseenSuit,
    outstandingDoubles,
    tilesOut,
    deadSuits,
    unseenPips,
    myPips,
  };
}

/**
 * Would this move shut the table, as far as you can actually tell?
 *
 * Deliberately built from public information only. The engine could simply
 * apply the move and read the result, but that would be reading the opponents'
 * hands. A player knows a block is coming when both ends are dead suits —
 * every tile matching them already accounted for — and that is the honest test.
 */
export function forcesBlock(
  state: GameState,
  seat: Seat,
  move: Move,
  k: Knowledge
): boolean {
  // Your last tile ends the round by going out, which is a domino, not a
  // tranca. Different decision, different arithmetic.
  if (state.hands[seat].length <= 1) return false;

  const [left, right] = resultingEnds(state, move);

  // Nobody hidden can answer either end.
  if (k.unseenSuit[left] > 0 || k.unseenSuit[right] > 0) return false;

  // And neither can you — otherwise the others simply pass back round to you
  // and the round carries on.
  return !state.hands[seat].some((id) => {
    if (id === move.tileId) return false;
    const { a, b } = parseTile(id);
    return a === left || b === left || a === right || b === right;
  });
}

/**
 * What a blocked game would score, counted the way El Tigre counts it.
 *
 * You know your own pips exactly. Your partner's and the opponents' you can
 * only estimate, so share out the unseen pips in proportion to how many tiles
 * each of them holds. Positive means your side comes out lighter and wins.
 */
export function blockedMargin(
  state: GameState,
  seat: Seat,
  k: Knowledge,
  spentPips: number
): number {
  const partner = ((seat + 2) % 4) as Seat;
  const opponents = [((seat + 1) % 4) as Seat, ((seat + 3) % 4) as Seat];
  const hidden = k.unseen.length || 1;
  const perTile = k.unseenPips / hidden;

  const mine = k.myPips - spentPips;
  const partnerEstimate = state.hands[partner].length * perTile;
  const theirs = opponents.reduce<number>(
    (sum, o) => sum + state.hands[o].length * perTile,
    0
  );

  return theirs - (mine + partnerEstimate);
}

/** The suit value a move leaves exposed at the end it is played on. */
export function exposedEnd(state: GameState, move: Move): number | null {
  if (state.line.length === 0) return null;
  const { a, b } = parseTile(move.tileId);
  const end = move.end === "left" ? state.leftEnd : state.rightEnd;
  return a === end ? b : a;
}

/** The value left at the other end, which this move does not touch. */
function untouchedEnd(state: GameState, end: End): number | null {
  return end === "left" ? state.rightEnd : state.leftEnd;
}

/** The two open ends after a move is played. */
export function resultingEnds(state: GameState, move: Move): [number, number] {
  const { a, b } = parseTile(move.tileId);
  if (state.line.length === 0) return [a, b];
  const exposed = exposedEnd(state, move)!;
  const other = untouchedEnd(state, move.end)!;
  return move.end === "left" ? [exposed, other] : [other, exposed];
}

/**
 * How freely a seat can move if the ends are `ends`.
 *
 * Counts unseen tiles that match an end the seat has not passed on, scaled by
 * how much of the unseen pool that seat holds. Higher means they can keep
 * playing; lower means they are close to being stuck.
 */
function mobility(
  seat: Seat,
  ends: [number, number],
  state: GameState,
  k: Knowledge
): number {
  const voids = k.voids[seat];
  const live = [...new Set(ends)].filter((v) => !voids.has(v));
  if (live.length === 0) return 0;

  let matching = 0;
  for (const id of k.unseen) {
    const { a, b } = parseTile(id);
    if (live.some((v) => a === v || b === v)) matching++;
  }
  const pool = k.unseen.length || 1;
  return (matching * state.hands[seat].length) / pool;
}

// ---------- opening ----------

/**
 * Opening move ("la salida"), following the classic Venezuelan school —
 * the "regla de oro" of El Tigre de Carayaca (Héctor Simosa Alarcón):
 *
 *  - Lead a double: doubles are hard to place and can be hanged ("ahorcado"),
 *    they force opponents onto a single suit, and they tell your partner which
 *    suit to follow.
 *  - Prefer the highest double that has company (other tiles of its suit), so
 *    you can keep feeding that suit.
 *  - With only bare doubles ("en pelo"), lead the highest one anyway rather
 *    than carry the points.
 *  - With no double at all, lead a high mixed tile from your strongest suit
 *    ("salida mata doble"), which tells your partner you hold no doubles.
 */
export function chooseOpening(hand: TileId[]): TileId {
  const suitCount = new Array(7).fill(0);
  for (const id of hand) {
    const { a, b } = parseTile(id);
    suitCount[a]++;
    if (b !== a) suitCount[b]++;
  }

  const doubles = hand.filter(isDouble);
  if (doubles.length > 0) {
    const accompanied = doubles.filter((id) => suitCount[parseTile(id).a] > 1);
    const pool = accompanied.length > 0 ? accompanied : doubles;
    return pool.reduce((best, id) => (tilePips(id) > tilePips(best) ? id : best));
  }

  return hand.reduce((best, id) => {
    const s = (t: TileId) => {
      const { a, b } = parseTile(t);
      return Math.max(suitCount[a], suitCount[b]) * 10 + tilePips(t);
    };
    return s(id) > s(best) ? id : best;
  });
}

// ---------- move scoring ----------

/**
 * Score every legal move. Exported so the post-round review can show what the
 * engine would have played, and by how much it preferred it.
 */
export function scoreMoves(
  state: GameState,
  seat: Seat,
  opts: AiOptions = {}
): ScoredMove[] {
  const difficulty = opts.difficulty ?? "medium";
  const jitter = opts.deterministic ? () => 0 : () => Math.random();
  const moves = legalMoves(state, seat);
  if (moves.length === 0) return [];

  const hand = state.hands[seat];
  const myTeam = teamOf(seat);
  const partner = ((seat + 2) % 4) as Seat;
  const opponents = [((seat + 1) % 4) as Seat, ((seat + 3) % 4) as Seat];
  const k = readTable(state, seat);

  // Easy play is shallow but not blind. It plays for weight, and it still
  // recognises the two things no player at any level should miss: going out,
  // and shutting a game its side would win.
  if (difficulty === "easy") {
    return moves
      .map((move) => {
        const reasons: string[] = ["Playing for weight"];
        let score = tilePips(move.tileId) * 0.5 + jitter() * 3;

        if (hand.length === 1) {
          score += 1000;
          reasons.push("Plays your last tile and wins the round");
        } else if (forcesBlock(state, seat, move, k)) {
          const margin = blockedMargin(state, seat, k, tilePips(move.tileId));
          score += margin > 0 ? 12 : -12;
          reasons.push(
            margin > 0
              ? "Shuts the game with your side lighter"
              : "Would shut the game with your side heavier"
          );
        }
        return { move, score, reasons };
      })
      .sort((a, b) => b.score - a.score);
  }

  const hard = difficulty === "hard";

  /**
   * Every level understands the same ideas; they differ in how strongly they
   * act on them. Easy (handled above) sees the block but still plays mostly by
   * weight, medium plays sound dominoes, hard counts properly. This keeps a
   * real ladder without making any level look like it cannot read the table.
   */
  const conviction = hard ? 1 : 0.7;

  const phase = phaseOf(state, hand.length);
  const endgame = phase === "end";

  // Your job right now, which moves as people pass. Tile counts are public, so
  // this is knowledge the AI is entitled to.
  const mano = manoAt(state.hands, state.opener);
  const role = roleOf(seat, mano);
  // The mano plays their own hand; everyone else is working for the team.
  const teamDuty = role === "mano" ? 0.45 : role === "tercera" ? 1.25 : 1;

  const scored = moves.map((move) => {
    const { a, b } = parseTile(move.tileId);
    const reasons: string[] = [];
    let score = 0;
    const weightOf = (id: TileId) => tilePips(id);

    // Going out ends the round in your favour — nothing beats it.
    if (hand.length === 1) {
      score += 1000;
      reasons.push("Plays your last tile and wins the round");
      if (isCapicua(state, move)) {
        // Worth no points in these rules, but worth saying out loud.
        score += 0.5;
        reasons.push("Closes on both ends — capicúa");
      }
    } else if (forcesBlock(state, seat, move, k)) {
      // La tranca. Not a hunch: count first, then decide whether to shut it.
      const margin = blockedMargin(state, seat, k, weightOf(move.tileId));
      const stake = 26 * conviction;
      score += margin > 0 ? stake : -stake;
      reasons.push(
        margin > 0
          ? `Shuts the game (tranca) with your side about ${Math.round(margin)} pips lighter`
          : `Would shut the game with your side about ${Math.round(-margin)} pips heavier — "la tranca es una jugada que no se debe hacer para perderla"`
      );
    }

    // Shedding weight protects you if the round is blocked — but it matters far
    // more late than early. Early on, position is worth more than points.
    const weight = tilePips(move.tileId);
    const weightPull = phase === "early" ? 0.3 : phase === "middle" ? 0.45 : 0.8;
    score += weight * weightPull;
    if (weight >= 9 && phase !== "early") reasons.push(`Sheds ${weight} points of weight`);

    // Doubles only fit one way, so place them while you can.
    if (isDouble(move.tileId)) {
      score += 2.5;
      reasons.push("Clears a double while it still fits");
    }

    // Keep the suits you are long in — they are your route back to the table.
    score += k.suitCount[a] * 0.5 + (b !== a ? k.suitCount[b] * 0.5 : 0);

    const exposed = exposedEnd(state, move);
    const other = untouchedEnd(state, move.end);

    if (exposed !== null) {
      // Squeeze opponents onto suits they have already failed on.
      for (const o of opponents) {
        if (k.voids[o].has(exposed)) {
          score += (hard ? 4 : 3) * teamDuty;
          reasons.push(`Leaves a ${exposed}, which an opponent has passed on`);
        }
      }
      // Never shut out your own partner — unless you hold the lead, in which
      // case El Tigre says play your own hand first.
      if (k.voids[partner].has(exposed)) {
        score -= (hard ? 5 : 3) * teamDuty;
        reasons.push(
          role === "mano"
            ? `Leaves a ${exposed} your partner cannot play — acceptable while you hold the lead`
            : `Leaves a ${exposed}, which your partner cannot play`
        );
      }

      // A suit nobody else can answer is a door only you hold the key to.
      if (k.deadSuits.has(exposed) && k.suitCount[exposed] > 0) {
        score += 3 * conviction;
        reasons.push(`Every remaining ${exposed} is in your hand — that end is yours alone`);
      }

      // Keep an answer to whatever you expose.
      const answers = k.suitCount[exposed] - (isDouble(move.tileId) ? 1 : 0);
      if (answers > 0) score += 0.75;

      if (hard) {
        // Chase an outstanding double: exhaust its suit and it stays stuck.
        if (k.outstandingDoubles.has(exposed) && k.unseenSuit[exposed] <= 3) {
          score += 2;
          reasons.push(`Presses the ${exposed}-${exposed}, still unplayed`);
        }

        // Follow your partner's suit — they told you what they hold.
        const partnerSuits = new Set(
          state.line.filter((t) => t.seat === partner).flatMap((t) => [t.left, t.right])
        );
        if (partnerSuits.has(exposed) && !k.voids[partner].has(exposed)) {
          score += 1.5;
          reasons.push(`Feeds the ${exposed}, a suit your partner has played`);
        }
      }
    }

    if (hard) {
      // Judge the position this move creates, not just the tile it spends:
      // keep your own side moving and choke the opponents.
      const ends = resultingEnds(state, move);
      const nextOpp = opponents[0]; // plays immediately after you
      const farOpp = opponents[1];

      const mNext = mobility(nextOpp, ends, state, k);
      const mFar = mobility(farOpp, ends, state, k);
      const mPartner = mobility(partner, ends, state, k);
      const mine = hand.filter(
        (id) => id !== move.tileId && ends.some((v) => {
          const t = parseTile(id);
          return t.a === v || t.b === v;
        })
      ).length;

      // Weights tuned by simulation: choking the player who moves next is worth
      // far more than any other positional consideration.
      score += mine * 0.8;
      score -= mNext * 3.6;
      score -= mFar * 1.4;
      score += mPartner * 0.6 * teamDuty;

      if (mNext < 0.6) {
        reasons.push(
          `Leaves ${ends[0]} and ${ends[1]} — the next opponent looks short of both`
        );
      }
      if (mine === 0 && hand.length > 2) {
        reasons.push("Warning: leaves you with no answer to either end");
      }

      if (endgame) {
        // With the round closing, carry as little weight as possible.
        const myPips = hand.reduce((s, id) => s + tilePips(id), 0) - weight;
        if (myPips <= 6) {
          score += 2;
          reasons.push("Leaves you light if the game gets blocked");
        }
      }
    }

    score += jitter() * (hard ? 0.15 : 0.3);
    return { move, score, reasons };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/** Returns the chosen move, or null to pass. */
export function chooseMove(
  state: GameState,
  seat: Seat,
  opts: AiOptions = {}
): Move | null {
  const moves = legalMoves(state, seat);
  if (moves.length === 0) return null;

  // A free opening: choose the tile deliberately, not just the first legal one.
  if (state.line.length === 0 && !state.mustOpenWithDoubleSix) {
    if ((opts.difficulty ?? "medium") !== "easy") {
      const opening = moves.find((m) => m.tileId === chooseOpening(state.hands[seat]));
      if (opening) return opening;
    }
  }

  if (moves.length === 1) return moves[0];
  return scoreMoves(state, seat, opts)[0].move;
}
