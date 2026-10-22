import type { TileId } from "@/engine/types";
import type { Rect } from "./dropTarget";

/** The most a held tile leans over, either way, in degrees. */
export const MAX_TILT = 12;

/** How the tile in your fingers is held: lifted this much, leaning this way. */
export const GHOST_SCALE = 1.14;
export const GHOST_LEAN = -6;
/** Held back over your hand, where letting go puts it back: smaller and faint. */
export const RETURN_SCALE = 0.94;
export const RETURN_OPACITY = 0.55;

/** How the ghost looked the moment you let go, so what replaces it starts there. */
export interface GhostPose {
  /** Its middle on screen. */
  x: number;
  y: number;
  /** Degrees it was turned, clockwise. */
  angle: number;
  /** Its long side on screen, in pixels. */
  height: number;
  /** The number on its top half. */
  top: number;
}

/**
 * Where a tile landing on the table starts, so it takes over from the ghost
 * without a jump: as big as the ghost was, turned so its halves sit the same
 * way round. `first` is the number the table draws on top (upright tile) or on
 * the left (flat tile); `long` is its long side in table units.
 */
export function landingStart(
  ghost: GhostPose,
  tile: { vertical: boolean; first: number; long: number },
  scale: number
): { scale: number; rotate: number } {
  const same = tile.first === ghost.top;
  // A flat tile turned a quarter clockwise has its left half on top.
  const turn = tile.vertical ? (same ? 0 : 180) : same ? 90 : -90;
  const s = scale > 0 ? scale : 1;
  return { scale: ghost.height / (tile.long * s), rotate: turn + ghost.angle };
}

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

let lastDrop: { tileId: TileId; pose: GhostPose; at: number } | null = null;

/**
 * How the ghost of a tile you just played looked as you let go, so the table
 * can show it gliding on from there rather than from somewhere off to the side.
 * Online, the play comes back from the server a moment later, hence the hand-off.
 */
export function rememberDrop(tileId: TileId, pose: GhostPose, now = Date.now()): void {
  lastDrop = { tileId, pose, at: now };
}

/** The let-go pose for this tile, once; null if it was not dropped just now. */
export function takeDrop(tileId: TileId, now = Date.now()): GhostPose | null {
  const d = lastDrop;
  if (!d || d.tileId !== tileId || now - d.at > DROP_MEMORY_MS) return null;
  lastDrop = null;
  return d.pose;
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
