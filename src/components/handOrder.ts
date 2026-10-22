import type { TileId } from "@/engine/types";
import type { Rect } from "./dropTarget";

/**
 * The order you have arranged your own tiles in.
 *
 * Kept on your side of the screen only: the game never sees it. When the hand
 * changes, tiles you still hold keep their place and anything new joins at the
 * end, in the order it was dealt.
 */
export function reconcileOrder(order: readonly TileId[], tiles: readonly TileId[]): TileId[] {
  const held = new Set(tiles);
  const kept = order.filter((id) => held.has(id));
  const seen = new Set(kept);
  return [...kept, ...tiles.filter((id) => !seen.has(id))];
}

/** Take `tileId` out and put it back at `index` among the others. */
export function moveTile(order: readonly TileId[], tileId: TileId, index: number): TileId[] {
  const rest = order.filter((id) => id !== tileId);
  if (rest.length === order.length) return [...order];
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), tileId, ...rest.slice(at)];
}

/**
 * Where among the other tiles a tile dropped at (x, y) belongs.
 *
 * `others` are the on-screen boxes of the rest of your hand, in order. A tile
 * comes before the drop if its row is above the pointer, or it is on the same
 * row and its middle is left of the pointer — so it works when the hand wraps.
 */
export function slotAt(x: number, y: number, others: readonly Rect[]): number {
  return others.filter((r) => r.bottom < y || (r.top <= y && (r.left + r.right) / 2 < x)).length;
}

/** Turn `tileId` round, or back again: the tiles you have flipped, after a tap. */
export function flipTile(flipped: ReadonlySet<TileId>, tileId: TileId): Set<TileId> {
  const next = new Set(flipped);
  if (next.has(tileId)) next.delete(tileId);
  else next.add(tileId);
  return next;
}
