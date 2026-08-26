import type { PlacedTile, Seat } from "@/engine/types";

/**
 * Board geometry for a square table.
 *
 * The chain starts in the middle of the table and grows in two directions.
 * Tiles never shrink — when an arm reaches the edge it turns the corner and
 * keeps running along the border, exactly as on a real table. Doubles lie
 * crosswise to the chain, everything else runs along it.
 */

export const TILE_LONG = 56;
export const TILE_SHORT = 28;

/**
 * Smallest table that can hold a full 28-tile chain cleanly — every tile joined,
 * nothing overlapping. (A full chain is 1372px of dominoes, and it has to coil.)
 * Smaller boards lay the chain out at this size and scale the whole table down,
 * so tile size still never changes while a round is being played.
 */
export const MIN_TABLE = 580;

export type Dir = "R" | "D" | "L" | "U";
export type Axis = "h" | "v";

export interface LaidTile {
  p: PlacedTile;
  idx: number;
  /** Top-left corner, in px, inside the square table. */
  x: number;
  y: number;
  vertical: boolean;
  /** Render the halves swapped so the connecting pips face the previous tile. */
  reversed: boolean;
  /** Direction the chain was travelling when this tile was laid. */
  dir: Dir;
  /** Which half of the chain this tile belongs to. */
  arm: "open" | "fwd" | "bwd";
}

const VEC: Record<Dir, [number, number]> = {
  R: [1, 0],
  D: [0, 1],
  L: [-1, 0],
  U: [0, -1],
};

/** Arms turn clockwise, so the chain spirals around the table. */
const CW: Record<Dir, Dir> = { R: "D", D: "L", L: "U", U: "R" };

/**
 * The opening tile lies flat toward whoever opened, so you can see who went out.
 *
 * "Toward" is from the point of view of whoever is looking. Every player sits at
 * the bottom of their own screen, so the table has to be turned to match: a tile
 * laid flat for the player on your left must read sideways to you.
 */
export function openingIsVertical(open: PlacedTile, viewer: Seat = 0): boolean {
  const relative = (open.seat - viewer + 4) % 4;
  return relative === 1 || relative === 3; // sitting to your right or left
}

/**
 * Direction the chain travels.
 *
 * The opening tile is the spinner: it lies flat toward whoever opened, and both
 * arms leave it crosswise, one from each half, running in opposite directions.
 * So the chain always travels perpendicular to the tile that started it —
 * double or not.
 */
export function lineAxis(line: PlacedTile[], viewer: Seat = 0): Axis {
  const open = line.find((t) => t.opening) ?? line[0];
  return openingIsVertical(open, viewer) ? "h" : "v";
}

function isHorizontalTravel(dir: Dir): boolean {
  return dir === "R" || dir === "L";
}

/** A double is crosswise: short along the chain, wide across it. */
function extents(dbl: boolean) {
  return {
    along: dbl ? TILE_SHORT : TILE_LONG,
    across: dbl ? TILE_LONG : TILE_SHORT,
  };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Place a tile whose trailing edge sits at `cursor`, travelling in `dir`. */
function rectFor(cursor: [number, number], dir: Dir, dbl: boolean): Rect {
  const { along, across } = extents(dbl);
  const [cx, cy] = cursor;
  const travelH = isHorizontalTravel(dir);
  return {
    x: dir === "R" ? cx : dir === "L" ? cx - along : cx - across / 2,
    y: dir === "D" ? cy : dir === "U" ? cy - along : cy - across / 2,
    w: travelH ? along : across,
    h: travelH ? across : along,
  };
}

interface Ring {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Turn early enough that the tile coming out of a corner — placed beyond the
 * end of the run, a full tile long — still fits on the table.
 */
const TURN_INSET = TILE_LONG;

/** Do two tiles share any area? Touching edge-to-edge does not count. */
function collides(r: Rect, placed: Rect[]): boolean {
  return placed.some(
    (p) =>
      r.x + 0.01 < p.x + p.w &&
      p.x + 0.01 < r.x + r.w &&
      r.y + 0.01 < p.y + p.h &&
      p.y + 0.01 < r.y + r.h
  );
}

/** Has this tile reached the edge of the table in the direction of travel? */
function exceeds(r: Rect, dir: Dir, ring: Ring): boolean {
  if (dir === "R") return r.x + r.w > ring.right - TURN_INSET;
  if (dir === "L") return r.x < ring.left + TURN_INSET;
  if (dir === "D") return r.y + r.h > ring.bottom - TURN_INSET;
  return r.y < ring.top + TURN_INSET;
}

/**
 * Turn the corner. `cursor` is where the chain leaves the previous tile — the
 * middle of the face it exits. Two shapes, depending on the turning tile:
 *
 *  - A tile running *along* the new direction cannot lie flat against the face
 *    it is turning off. It tucks into the corner square instead, alongside the
 *    end of the old run, making the familiar L.
 *  - A crosswise double does sit squarely beyond that face, centred on it, and
 *    the chain leaves from its far side.
 */
function cornerCursor(
  cursor: [number, number],
  from: Dir,
  to: Dir,
  prevAcross: number,
  dbl: boolean
): [number, number] {
  const { across, along } = extents(dbl);
  if (dbl) {
    return [
      cursor[0] + VEC[from][0] * (across / 2) - VEC[to][0] * (along / 2),
      cursor[1] + VEC[from][1] * (across / 2) - VEC[to][1] * (along / 2),
    ];
  }
  return [
    cursor[0] - VEC[from][0] * (across / 2) + VEC[to][0] * (prevAcross / 2),
    cursor[1] - VEC[from][1] * (across / 2) + VEC[to][1] * (prevAcross / 2),
  ];
}

function walk(
  tiles: { p: PlacedTile; idx: number }[],
  startCursor: [number, number],
  startDir: Dir,
  size: number,
  margin: number,
  forward: boolean,
  startAcross: number,
  placed: Rect[],
  /** The opening tile is mixed, so a double leaving it lies in line. */
  inLineOffSpinner: boolean
): LaidTile[] {
  const out: LaidTile[] = [];
  let cursor = startCursor;
  let dir = startDir;
  let ring: Ring = {
    left: margin,
    top: margin,
    right: size - margin,
    bottom: size - margin,
  };
  let turns = 0;
  let prevAcross = startAcross;

  tiles.forEach(({ p, idx }, position) => {
    /**
     * Doubles lie crosswise, with one exception.
     *
     * A double landing straight off a *mixed* opening tile would sit squarely
     * across it, two wide tiles one atop the other, which reads as a stack
     * rather than a join. In that one spot it lies in line instead. Off a
     * double spinner there is no such clash, because the arms leave from the
     * middle rather than from one half.
     */
    const dbl = p.left === p.right && !(position === 0 && inLineOffSpinner);
    const { across, along } = extents(dbl);

    // Turn the corner if this tile would run off the table, or into the part of
    // the chain already on it. At most one turn per tile: a corner is measured
    // against the tile it turns off, so turning twice would offset the chain
    // from a tile that is not there and break the join.
    let rect = rectFor(cursor, dir, dbl);
    if (exceeds(rect, dir, ring) || collides(rect, placed)) {
      // A full lap done: coil inward so the chain never doubles back on itself.
      if (turns > 0 && turns % 4 === 0) {
        ring = {
          left: ring.left + TILE_LONG,
          top: ring.top + TILE_LONG,
          right: ring.right - TILE_LONG,
          bottom: ring.bottom - TILE_LONG,
        };
      }
      cursor = cornerCursor(cursor, dir, CW[dir], prevAcross, dbl);
      dir = CW[dir];
      turns++;
      rect = rectFor(cursor, dir, dbl);
    }

    // On a table too small to coil a long chain cleanly, keep the tile on the
    // felt rather than letting it slide off the edge.
    rect = {
      ...rect,
      x: Math.min(Math.max(rect.x, 0), size - rect.w),
      y: Math.min(Math.max(rect.y, 0), size - rect.h),
    };

    out.push({
      p,
      idx,
      x: rect.x,
      y: rect.y,
      // Crosswise doubles stand upright on a horizontal run, flat on a vertical one.
      vertical: isHorizontalTravel(dir) ? dbl : !dbl,
      reversed: forward ? dir === "L" || dir === "U" : dir === "R" || dir === "D",
      dir,
      arm: forward ? "fwd" : "bwd",
    });
    placed.push(rect);

    cursor = [cursor[0] + VEC[dir][0] * along, cursor[1] + VEC[dir][1] * along];
    prevAcross = across;
  });

  return out;
}

/**
 * Lay the chain out on a square table of `size` px, opening tile centered.
 */
export function layoutLine(
  line: PlacedTile[],
  size: number,
  margin = 6,
  /** Whose screen this is. The table turns so they always sit at the bottom. */
  viewer: Seat = 0
): LaidTile[] {
  if (line.length === 0) return [];

  let oIdx = line.findIndex((t) => t.opening);
  if (oIdx === -1) oIdx = 0;
  const open = line[oIdx];
  const oVert = openingIsVertical(open, viewer);

  const c = size / 2;
  const w = oVert ? TILE_SHORT : TILE_LONG;
  const h = oVert ? TILE_LONG : TILE_SHORT;

  const axis = lineAxis(line, viewer);
  // How wide the opening tile sits across the chain's lane.
  const fwdDir: Dir = axis === "h" ? "R" : "D";

  const items: LaidTile[] = [
    {
      p: open,
      idx: oIdx,
      x: c - w / 2,
      y: c - h / 2,
      vertical: oVert,
      reversed: false,
      dir: fwdDir,
      arm: "open",
    },
  ];

  const bwdDir: Dir = axis === "h" ? "L" : "U";

  const outward = TILE_SHORT / 2; // clear of the spinner's side

  // On a non-double the two halves show different suits, so each arm has to
  // leave from its own half and the runs sit half a tile apart. A double shows
  // the same suit on both halves, so there is nothing to distinguish: the arms
  // leave from the middle, straight out of either side.
  const openDouble = open.left === open.right;
  const halfOffset = openDouble ? 0 : TILE_LONG / 4;

  const fwdStart: [number, number] =
    axis === "h" ? [c + outward, c + halfOffset] : [c + halfOffset, c + outward];
  const bwdStart: [number, number] =
    axis === "h" ? [c - outward, c - halfOffset] : [c - halfOffset, c - outward];

  const after = line.slice(oIdx + 1).map((p, i) => ({ p, idx: oIdx + 1 + i }));
  const before = line
    .slice(0, oIdx)
    .map((p, i) => ({ p, idx: i }))
    .reverse();

  // Both arms share one record of what is already on the table, so the second
  // arm never coils into the first.
  // Each arm runs in a lane the width of the spinner half it left from.
  const openAcross = TILE_SHORT;
  const placed: Rect[] = [{ x: c - w / 2, y: c - h / 2, w, h }];

  // Off a mixed opening the two arms leave from its halves, so a crosswise
  // double there would sit across the spinner itself. Off a double they leave
  // from the middle and there is nothing to clash with.
  const mixedOpening = !openDouble;
  items.push(
    ...walk(after, fwdStart, fwdDir, size, margin, true, openAcross, placed, mixedOpening)
  );
  items.push(
    ...walk(before, bwdStart, bwdDir, size, margin, false, openAcross, placed, mixedOpening)
  );

  return items;
}
