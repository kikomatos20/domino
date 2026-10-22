import type { TileId } from "@/engine/types";
import type { Rect } from "./dropTarget";

/** The most a held tile leans over, either way, in degrees. */
export const MAX_TILT = 12;

/**
 * How far the tile in your fingers leans as it moves: into the direction of
 * travel, more the faster you go, easing off when you slow down. `dx` is how
 * far the pointer moved sideways since the last reading.
 */
export function tiltFor(prev: number, dx: number): number {
  const target = Math.max(-MAX_TILT, Math.min(MAX_TILT, dx * 0.9));
  return prev * 0.6 + target * 0.4;
}

/** How long a let-go point is worth keeping while the play goes through. */
export const DROP_MEMORY_MS = 4000;

let lastDrop: { tileId: TileId; x: number; y: number; at: number } | null = null;

/**
 * Where you let go of a tile you just played, so the table can show it gliding
 * on from there rather than from somewhere off to the side. Online, the play
 * comes back from the server a moment later, hence the hand-off.
 */
export function rememberDrop(tileId: TileId, x: number, y: number, now = Date.now()): void {
  lastDrop = { tileId, x, y, at: now };
}

/** The let-go point for this tile, once; null if it was not dropped just now. */
export function takeDrop(tileId: TileId, now = Date.now()): { x: number; y: number } | null {
  const d = lastDrop;
  if (!d || d.tileId !== tileId || now - d.at > DROP_MEMORY_MS) return null;
  lastDrop = null;
  return { x: d.x, y: d.y };
}

/**
 * The offset a tile on the table starts its landing from, so it begins under
 * your finger: from the middle of its slot (on screen) to the drop point, in
 * the table's own units, which are scaled by `scale` on screen.
 */
export function flyFrom(drop: { x: number; y: number }, slot: Rect, scale: number): [string, string] {
  const cx = (slot.left + slot.right) / 2;
  const cy = (slot.top + slot.bottom) / 2;
  const s = scale > 0 ? scale : 1;
  return [`${Math.round((drop.x - cx) / s)}px`, `${Math.round((drop.y - cy) / s)}px`];
}
