import type { End, Move, TileId } from "@/engine/types";

/**
 * Playing without a drag.
 *
 * A tap turns a tile round, as it always has. A second tap on the same tile
 * soon after means "play this": if it fits one end it goes there, if it fits
 * both the two ends light up and you pick one. Enter does the same from the
 * keyboard. Dragging still works exactly as before.
 */

/** Two taps on the same tile within this many ms are a double-tap. */
export const DOUBLE_TAP_MS = 320;

export type TapIntent =
  | { kind: "none" }
  | { kind: "play"; end: End }
  | { kind: "choose"; ends: End[] };

/** What playing `tileId` should do, given the legal moves right now. */
export function tapIntent(moves: Move[], tileId: TileId): TapIntent {
  const ends = Array.from(new Set(moves.filter((m) => m.tileId === tileId).map((m) => m.end)));
  if (ends.length === 0) return { kind: "none" };
  if (ends.length === 1) return { kind: "play", end: ends[0] };
  // Always offer them in table order, left first.
  return { kind: "choose", ends: ends.sort((a) => (a === "left" ? -1 : 1)) };
}

export interface Tap {
  tileId: TileId;
  at: number;
}

/** Whether a tap on `tileId` at `now` completes a double-tap after `prev`. */
export function isDoubleTap(prev: Tap | null, tileId: TileId, now: number): boolean {
  return prev !== null && prev.tileId === tileId && now - prev.at >= 0 && now - prev.at <= DOUBLE_TAP_MS;
}

/** How a tile in your hand is announced to a screen reader. */
export function tileLabel(a: number, b: number, playable: boolean, yourTurn: boolean): string {
  const name = `${a}|${b}`;
  if (!yourTurn) return name;
  return playable ? `${name}, playable` : `${name}, can't play`;
}
