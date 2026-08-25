import type { End } from "@/engine/types";
import type { EndAnchors } from "./Board";

/** How close to an end you have to drop for it to count. */
export const DROP_RADIUS = 90;

/** A rectangle in viewport coordinates — the shape a DOMRect gives us. */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function inside(rect: Rect | null, x: number, y: number): boolean {
  if (!rect) return false;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Where a dragged tile would land if you let go here, or null for "nowhere".
 *
 * Two rules, in order:
 *
 * 1. Over your own hand is always a cancel. Dragging a tile back is how people
 *    change their mind, and it has to be reliable even when the tile fits only
 *    one end — otherwise second-guessing yourself plays the tile.
 * 2. Anywhere else, a tile with only one legal end goes there without you having
 *    to hit the target. Hunting for a small anchor on a phone is no fun, and
 *    with one option there is nothing to disambiguate.
 */
export function resolveDrop(
  x: number,
  y: number,
  activeEnds: ReadonlySet<End>,
  ends: EndAnchors,
  handRect: Rect | null
): End | null {
  if (inside(handRect, x, y)) return null;

  const only = [...activeEnds];
  if (only.length === 1) return only[0];

  let best: End | null = null;
  let bestDistance = DROP_RADIUS;
  for (const end of ["left", "right"] as End[]) {
    if (!activeEnds.has(end)) continue;
    const anchor = ends[end];
    if (!anchor) continue;
    const d = Math.hypot(anchor.x - x, anchor.y - y);
    if (d < bestDistance) {
      bestDistance = d;
      best = end;
    }
  }
  return best;
}
