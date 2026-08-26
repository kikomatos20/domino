import type { PlacedTile } from "@/engine/types";

/**
 * Which tiles to show next, given what has arrived and what is on screen.
 *
 * Pulled out of the hook so the ordering can be tested without a browser: the
 * bug this replaced — a table that mounted with three tiles already down and
 * replayed none of them — was in exactly this decision.
 *
 * Tiles are only ever added to the two ends of the chain, so what is showing is
 * always a contiguous run of what has arrived. Growing it by one each call, from
 * the opening tile outwards, reconstructs a readable version of how the round
 * unfolded. (`line` is in table order rather than the order things were played,
 * so this is an approximation — but every tile still gets its own moment and its
 * own announcement, which is the point.)
 */
export function replayFrom(line: PlacedTile[], shown: PlacedTile[]): PlacedTile[] {
  if (shown.length >= line.length) return shown;

  const offset = matchOffset(line, shown);
  if (offset === -1) return line; // cannot line them up; show the truth

  if (shown.length === 0) {
    return line.slice(offset, offset + 1);
  }

  const missingAfter = line.length - offset - shown.length;
  if (missingAfter > 0) return line.slice(offset, offset + shown.length + 1);
  return line.slice(offset - 1, offset + shown.length);
}

/** Where `shown` sits inside `line`, or -1 if it does not. */
export function matchOffset(line: PlacedTile[], shown: PlacedTile[]): number {
  // Nothing shown yet: begin at the tile that opened the round, so the replay
  // grows outwards from the spinner the way the round actually did.
  if (shown.length === 0) {
    const opening = line.findIndex((t) => t.opening);
    return opening === -1 ? Math.max(0, line.length - 1) : opening;
  }

  const same = (a: PlacedTile, b: PlacedTile) =>
    a.left === b.left && a.right === b.right && a.seat === b.seat;

  for (let offset = 0; offset + shown.length <= line.length; offset++) {
    let ok = true;
    for (let i = 0; i < shown.length; i++) {
      if (!same(line[offset + i], shown[i])) {
        ok = false;
        break;
      }
    }
    if (ok) return offset;
  }
  return -1;
}

/** Which end the newly revealed tile landed on, for the placement animation. */
export function revealedEnd(before: PlacedTile[], after: PlacedTile[]): "left" | "right" {
  if (before.length === 0) return "right";
  return after[0] === before[0] ? "right" : "left";
}
