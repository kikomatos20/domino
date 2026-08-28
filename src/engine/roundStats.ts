/**
 * What happened in one round, for one player.
 *
 * Pure and dependency-free on purpose: the solo game calls this in the browser
 * and the server calls it for an online table, and both must produce exactly
 * the same shape. The review already works all of this out and then throws it
 * away when the dialog closes.
 */

import { reviewRound } from "./review";
import { roleOf } from "./roles";
import { teamOf } from "./engine";
import type { MoveRecord, RoundResult, Seat } from "./types";

/**
 * The parts of a finished round these figures are drawn from.
 *
 * Narrower than a whole GameState on purpose: the server has the full state,
 * while a player's browser only ever holds the redacted view. Both can satisfy
 * this, so the same code produces the same numbers on either side.
 */
export interface RoundSource {
  matchId: string;
  roundNumber: number;
  opener: Seat;
  history: MoveRecord[];
  roundOver: RoundResult | null;
}

export interface RoundStat {
  /** The match this round was part of. */
  matchId: string;
  roundNumber: number;
  seat: Seat;
  roleAtStart: string;
  won: boolean;
  kind: string;
  dominoed: boolean;
  capicua: boolean;
  closed: boolean;
  closedWon: boolean;
  passes: number;
  pipsLeft: number;
  moves: number;
  decided: number;
  accuracy: number | null;
  engineAgreement: number | null;
  teamPlay: number | null;
  mistakes: number;
  inaccuracies: number;
}

/**
 * Everything worth keeping about how one seat played one finished round.
 *
 * Pure, so the solo game can call it in the browser and the server can call it
 * for an online table, and both produce the same shape.
 */
export function statsFor(game: RoundSource, seat: Seat): RoundStat | null {
  const over = game.roundOver;
  if (!over) return null;

  const review = reviewRound(game.history, seat);
  const plays = review.moves;
  const decided = plays.filter((m) => m.choices > 1);

  // Who shut the game, if anyone did: the last tile played before it stopped.
  const lastPlay = [...game.history].reverse().find((r) => r.kind === "play");
  const closed = over.kind !== "domino" && lastPlay?.seat === seat;

  return {
    matchId: game.matchId,
    roundNumber: game.roundNumber,
    seat,
    roleAtStart: roleOf(seat, game.opener),
    won: over.winningTeam === teamOf(seat),
    kind: over.kind,
    dominoed: over.kind === "domino" && over.winnerSeat === seat,
    capicua: Boolean(over.capicua) && over.winnerSeat === seat,
    closed,
    closedWon: closed && over.winningTeam === teamOf(seat),
    passes: game.history.filter((r) => r.seat === seat && r.kind === "pass").length,
    pipsLeft: over.pips[seat],
    moves: plays.length,
    decided: decided.length,
    accuracy: decided.length ? review.accuracy : null,
    engineAgreement: decided.length
      ? Math.round((review.engineAgreement / decided.length) * 100)
      : null,
    teamPlay: review.teamPlay,
    mistakes: plays.filter((m) => m.verdict === "mistake").length,
    inaccuracies: plays.filter((m) => m.verdict === "inaccuracy").length,
  };
}
