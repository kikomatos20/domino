import { describe, expect, it } from "vitest";
import { MIN_TABLE, TILE_LONG, TILE_SHORT, layoutLine, lineAxis } from "./lineLayout";
import type { LaidTile } from "./lineLayout";
import type { PlacedTile, Seat } from "@/engine/types";

/** Build a connected line of `n` tiles opened by `openerSeat`. */
function makeLine(n: number, openerSeat: Seat, openDouble: boolean): PlacedTile[] {
  const line: PlacedTile[] = [
    { left: 6, right: openDouble ? 6 : 5, seat: openerSeat, opening: true },
  ];
  let right = openDouble ? 6 : 5;
  for (let i = 1; i < n; i++) {
    const nextRight = (right + i) % 7;
    line.push({ left: right, right: nextRight, seat: (i % 4) as Seat });
    right = nextRight;
  }
  return line;
}

/** A realistic full round: all 28 tiles, 7 of them doubles. */
function fullLine(openerSeat: Seat): PlacedTile[] {
  const line: PlacedTile[] = [
    { left: 6, right: 6, seat: openerSeat, opening: true },
  ];
  for (let i = 1; i < 28; i++) {
    const dbl = i % 4 === 0; // 6 more doubles
    line.push({ left: i % 7, right: dbl ? i % 7 : (i + 1) % 7, seat: (i % 4) as Seat });
  }
  return line;
}

function rectOf(it: { x: number; y: number; vertical: boolean }) {
  return {
    x: it.x,
    y: it.y,
    w: it.vertical ? TILE_SHORT : TILE_LONG,
    h: it.vertical ? TILE_LONG : TILE_SHORT,
  };
}

function overlaps(a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) {
  // Shrink by 1px so tiles that merely touch edge-to-edge don't count.
  return (
    a.x + 1 < b.x + b.w && b.x + 1 < a.x + a.w && a.y + 1 < b.y + b.h && b.y + 1 < a.y + a.h
  );
}

const SEATS: Seat[] = [0, 1, 2, 3];
const EPSILON = 0.01;

/** How much of the previous tile's exit face the next tile covers. */
function exitFaceContact(prev: LaidTile, next: LaidTile): number {
  const a = rectOf(prev);
  const b = rectOf(next);
  if (prev.dir === "R" || prev.dir === "L") {
    const face = prev.dir === "R" ? a.x + a.w : a.x;
    const onFace =
      prev.dir === "R"
        ? Math.abs(b.x - face) < EPSILON
        : Math.abs(b.x + b.w - face) < EPSILON;
    return onFace ? Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) : 0;
  }
  const face = prev.dir === "D" ? a.y + a.h : a.y;
  const onFace =
    prev.dir === "D"
      ? Math.abs(b.y - face) < EPSILON
      : Math.abs(b.y + b.h - face) < EPSILON;
  return onFace ? Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) : 0;
}

/** Longest edge the two tiles share, whichever sides happen to meet. */
function sharedEdge(prev: LaidTile, next: LaidTile): number {
  const a = rectOf(prev);
  const b = rectOf(next);
  const xAdj =
    Math.abs(a.x + a.w - b.x) < EPSILON || Math.abs(b.x + b.w - a.x) < EPSILON;
  const yAdj =
    Math.abs(a.y + a.h - b.y) < EPSILON || Math.abs(b.y + b.h - a.y) < EPSILON;
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  return Math.max(xAdj ? yOverlap : 0, yAdj ? xOverlap : 0);
}

/**
 * How well two consecutive tiles are joined.
 *
 * On a straight run they must meet face to face — the next tile covers the face
 * the chain exits. At a corner the turning tile tucks alongside that end
 * instead, making an L, so there any shared edge counts. Either way the contact
 * must be a full tile-width: tiles that merely clip at a corner, or sit beside
 * each other without a join, do not count as connected.
 */
function joinContact(prev: LaidTile, next: LaidTile): number {
  return prev.dir === next.dir ? exitFaceContact(prev, next) : sharedEdge(prev, next);
}

/** Walk the chain in play order, pairing each tile with the one it joins. */
function chainPairs(items: LaidTile[]): [LaidTile, LaidTile][] {
  const open = items.find((i) => i.arm === "open")!;
  const pairs: [LaidTile, LaidTile][] = [];
  for (const arm of ["fwd", "bwd"] as const) {
    const seq = items.filter((i) => i.arm === arm);
    seq.forEach((tile, j) => {
      const prev = j === 0 ? { ...open, dir: tile.dir } : seq[j - 1];
      pairs.push([prev, tile]);
    });
  }
  return pairs;
}

describe("lineAxis", () => {
  it("always runs the chain crosswise to the opening tile", () => {
    for (const openDouble of [true, false]) {
      // You and your partner lay it flat, so the chain runs up and down.
      expect(lineAxis(makeLine(1, 0, openDouble))).toBe("v");
      expect(lineAxis(makeLine(1, 2, openDouble))).toBe("v");
      // East and West lay it sideways, so the chain runs left and right.
      expect(lineAxis(makeLine(1, 1, openDouble))).toBe("h");
      expect(lineAxis(makeLine(1, 3, openDouble))).toBe("h");
    }
  });
});

describe("the table turns to face whoever is looking", () => {
  // Everyone sits at the bottom of their own screen, so the same game has to be
  // drawn differently for each player. East opening lies flat for East, and
  // must read sideways to the player opposite them.
  const line: PlacedTile[] = [
    { left: 1, right: 6, seat: 1, opening: true },
    { left: 6, right: 3, seat: 2 },
  ];

  it("lays the opening tile flat for the player who opened, whoever is watching", () => {
    for (const opener of SEATS) {
      const own: PlacedTile[] = [{ left: 1, right: 6, seat: opener, opening: true }];
      // Seen by the opener: flat (horizontal), because they are at the bottom.
      expect(layoutLine(own, 620, undefined, opener)[0].vertical).toBe(false);
      // Seen from across the table: also flat — they are at the top.
      expect(
        layoutLine(own, 620, undefined, ((opener + 2) % 4) as Seat)[0].vertical
      ).toBe(false);
      // Seen from either side: sideways.
      expect(
        layoutLine(own, 620, undefined, ((opener + 1) % 4) as Seat)[0].vertical
      ).toBe(true);
      expect(
        layoutLine(own, 620, undefined, ((opener + 3) % 4) as Seat)[0].vertical
      ).toBe(true);
    }
  });

  it("turns the whole chain with it, not just the opening tile", () => {
    // East opened, so for East the chain runs up and down their own screen.
    expect(lineAxis(line, 1)).toBe("v");
    // For the player to East's left it runs across.
    expect(lineAxis(line, 0)).toBe("h");
    expect(lineAxis(line, 2)).toBe("h");
    // And for the player opposite East, up and down again.
    expect(lineAxis(line, 3)).toBe("v");
  });

  it("still joins up properly from every seat", () => {
    for (const viewer of SEATS) {
      const items = layoutLine(line, 620, undefined, viewer);
      for (const [prev, next] of chainPairs(items)) {
        expect(joinContact(prev, next)).toBeGreaterThanOrEqual(TILE_SHORT - EPSILON);
      }
    }
  });
});

describe("the opening tile as spinner", () => {
  /** East opens 1|6; partner answers the 6, you answer the 1. */
  const line: PlacedTile[] = [
    { left: 1, right: 6, seat: 1, opening: true },
    { left: 6, right: 3, seat: 2 },
  ];
  const both: PlacedTile[] = [{ left: 0, right: 1, seat: 0 }, ...line];

  it("sends the two arms off opposite sides, one from each half", () => {
    const items = layoutLine(both, 560);
    const open = items.find((i) => i.arm === "open")!;
    const right = items.find((i) => i.arm === "fwd")!;
    const left = items.find((i) => i.arm === "bwd")!;
    const [o, r, l] = [rectOf(open), rectOf(right), rectOf(left)];

    // The spinner lies flat toward East; the answers lie across it.
    expect(open.vertical).toBe(true);
    expect(right.vertical).toBe(false);
    expect(left.vertical).toBe(false);

    // Opposite sides of the spinner.
    expect(r.x).toBeGreaterThanOrEqual(o.x + o.w - EPSILON);
    expect(l.x + l.w).toBeLessThanOrEqual(o.x + EPSILON);

    // Each answer covers its own half of the spinner, and they do not share one.
    expect(r.h).toBe(TILE_SHORT);
    expect(l.h).toBe(TILE_SHORT);
    expect(Math.abs(r.y - l.y)).toBe(TILE_SHORT);
    // The 6 end is the lower half here, so the partner's tile sits low.
    expect(r.y).toBeGreaterThan(l.y);
  });

  it("sends both arms straight out of the middle when the spinner is a double", () => {
    // East opens 6|6; the two halves show the same suit, so there is no reason
    // to stagger the arms.
    const doubleLine: PlacedTile[] = [
      { left: 3, right: 6, seat: 0 },
      { left: 6, right: 6, seat: 1, opening: true },
      { left: 6, right: 2, seat: 2 },
    ];
    const items = layoutLine(doubleLine, 620);
    const open = rectOf(items.find((i) => i.arm === "open")!);
    const right = rectOf(items.find((i) => i.arm === "fwd")!);
    const left = rectOf(items.find((i) => i.arm === "bwd")!);

    // Both answers share the spinner's centre line, rather than sitting on
    // opposite halves of it.
    const centre = open.y + open.h / 2;
    expect(right.y + right.h / 2).toBeCloseTo(centre, 5);
    expect(left.y + left.h / 2).toBeCloseTo(centre, 5);
  });

  it("joins each answer to the spinner half it matches", () => {
    for (const [prev, next] of chainPairs(layoutLine(both, 560))) {
      expect(joinContact(prev, next)).toBeGreaterThanOrEqual(TILE_SHORT - EPSILON);
    }
  });
});

describe("layoutLine", () => {
  it("places every tile exactly once", () => {
    for (const seat of SEATS) {
      for (const n of [1, 2, 7, 14, 28]) {
        const items = layoutLine(makeLine(n, seat, true), 560);
        expect(items.length).toBe(n);
        expect(new Set(items.map((i) => i.idx)).size).toBe(n);
      }
    }
  });

  it("centers the opening tile on the table", () => {
    for (const seat of SEATS) {
      const size = 560;
      const items = layoutLine(makeLine(12, seat, true), size);
      const open = items.find((i) => i.p.opening)!;
      const r = rectOf(open);
      expect(r.x + r.w / 2).toBeCloseTo(size / 2, 5);
      expect(r.y + r.h / 2).toBeCloseTo(size / 2, 5);
    }
  });

  it("lays the opening tile flat toward whoever opened", () => {
    expect(layoutLine(makeLine(3, 0, true), 560)[0].vertical).toBe(false); // you
    expect(layoutLine(makeLine(3, 2, true), 560)[0].vertical).toBe(false); // partner
    expect(layoutLine(makeLine(3, 1, true), 560)[0].vertical).toBe(true); // East
    expect(layoutLine(makeLine(3, 3, true), 560)[0].vertical).toBe(true); // West
  });

  it("keeps every tile on the table, turning corners instead of shrinking", () => {
    for (const seat of SEATS) {
      for (const size of [360, 480, 560, 700]) {
        for (const it of layoutLine(fullLine(seat), size)) {
          const r = rectOf(it);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(size);
          expect(r.y + r.h).toBeLessThanOrEqual(size);
        }
      }
    }
  });

  it("never overlaps two tiles on a full 28-tile round", () => {
    for (const seat of SEATS) {
      for (const size of [MIN_TABLE, 620, 700]) {
        const rects = layoutLine(fullLine(seat), size).map(rectOf);
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            expect(overlaps(rects[i], rects[j])).toBe(false);
          }
        }
      }
    }
  });

  it("never overlaps, wherever the doubles happen to fall", () => {
    // The fixed chain above puts a double every fourth tile. Real rounds do not
    // — and a crosswise double sticking out near a corner is exactly where the
    // one-turn-per-tile rule can run out of room.
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    const problems: string[] = [];
    for (let attempt = 0; attempt < 200; attempt++) {
      const seat = SEATS[Math.floor(rand() * 4)];
      const line: PlacedTile[] = [
        { left: 6, right: 6, seat, opening: true },
      ];
      for (let i = 1; i < 28; i++) {
        const dbl = rand() < 0.25;
        const v = Math.floor(rand() * 7);
        line.push({ left: v, right: dbl ? v : (v + 1) % 7, seat: (i % 4) as Seat });
      }

      for (const size of [MIN_TABLE, 620]) {
        const rects = layoutLine(line, size).map(rectOf);
        for (let i = 0; i < rects.length && problems.length < 4; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            if (overlaps(rects[i], rects[j])) {
              problems.push(`attempt ${attempt}, size ${size}: tiles ${i} and ${j} overlap`);
              break;
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("joins tiles face to face, never side by side or corner to corner", () => {
    for (const seat of SEATS) {
      for (const size of [MIN_TABLE, 620, 700]) {
        for (const [prev, next] of chainPairs(layoutLine(fullLine(seat), size))) {
          expect(
            joinContact(prev, next),
            `tile ${next.idx} does not meet the exit face of tile ${prev.idx} (size ${size}, seat ${seat})`
          ).toBeGreaterThanOrEqual(TILE_SHORT - EPSILON);
        }
      }
    }
  });

  it("actually turns corners on a long chain", () => {
    const items = layoutLine(fullLine(0), 400);
    // A chain that only ran straight would share one axis; corners break that.
    const xs = new Set(items.map((i) => Math.round(i.x)));
    const ys = new Set(items.map((i) => Math.round(i.y)));
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
  });

  it("stays tidy across hundreds of random chains", () => {
    const EPS = 0.01;
    const seeded = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
      };
    };
    // A random but legal chain: every tile matches the previous open end.
    const randomLine = (n: number, seat: Seat, r: () => number): PlacedTile[] => {
      const start = Math.floor(r() * 7);
      const openDouble = r() < 0.35;
      let right = openDouble ? start : (start + 1) % 7;
      const line: PlacedTile[] = [
        { left: start, right, seat, opening: true },
      ];
      for (let i = 1; i < n; i++) {
        const next = r() < 0.25 ? right : Math.floor(r() * 7);
        line.push({ left: right, right: next, seat: (i % 4) as Seat });
        right = next;
      }
      return line;
    };
    // Sizes the app actually renders on a laptop or tablet. A full 28-tile
    // chain is 1372px of dominoes; below ~480px square there is genuinely not
    // enough room to coil it without the two arms meeting (see the test below).
    for (let seed = 1; seed <= 120; seed++) {
      for (const seat of SEATS) {
        for (const size of [MIN_TABLE, 620, 700]) {
          const line = randomLine(28, seat, seeded(seed * 131 + seat));
          const items = layoutLine(line, size);
          const rects = items.map(rectOf);
          const where = `seed ${seed}/seat ${seat}/size ${size}`;

          // Collect problems first, then assert once — 1400 layouts is far too
          // many for a per-tile expect() call.
          const problems: string[] = [];
          for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            if (r.x < 0 || r.y < 0 || r.x + r.w > size || r.y + r.h > size) {
              problems.push(`${where}: tile ${i} off the table`);
            }
            for (let j = i + 1; j < rects.length; j++) {
              if (overlaps(r, rects[j])) {
                problems.push(`${where}: tiles ${i} and ${j} overlap`);
              }
            }
          }
          for (const [prev, next] of chainPairs(items)) {
            if (joinContact(prev, next) < TILE_SHORT - EPSILON) {
              problems.push(`${where}: tile ${next.idx} not joined face to face`);
            }
          }
          expect(problems).toEqual([]);
        }
      }
    }
  });

  it("lays doubles crosswise to the run", () => {
    const line: PlacedTile[] = [
      { left: 6, right: 6, seat: 0, opening: true }, // flat -> chain runs vertical
      { left: 6, right: 3, seat: 1 },
      { left: 3, right: 3, seat: 2 },
    ];
    const items = layoutLine(line, 560);
    const nonDouble = items.find((i) => i.idx === 1)!;
    const double = items.find((i) => i.idx === 2)!;
    expect(nonDouble.vertical).toBe(true); // along a vertical chain
    expect(double.vertical).toBe(false); // crosswise
  });

  it("lays a double in line when it comes straight off a mixed opening", () => {
    // The one exception. Crosswise here would put two wide tiles one atop the
    // other, across the spinner itself, which reads as a stack not a join.
    const line: PlacedTile[] = [
      { left: 4, right: 5, seat: 0, opening: true },
      { left: 5, right: 5, seat: 1 },
    ];
    const items = layoutLine(line, 560);
    const open = items.find((i) => i.idx === 0)!;
    const double = items.find((i) => i.idx === 1)!;

    // The spinner lies flat; the double runs away from it, not across it.
    expect(open.vertical).toBe(false);
    expect(double.vertical).toBe(true);

    // Their footprints must not overlap in the direction of the run.
    const openBottom = open.y + (open.vertical ? TILE_LONG : TILE_SHORT);
    expect(double.y).toBeGreaterThanOrEqual(openBottom - 0.01);
  });

  it("goes back to crosswise for the next double along that same arm", () => {
    // Only the tile touching the spinner is special.
    const line: PlacedTile[] = [
      { left: 4, right: 5, seat: 0, opening: true },
      { left: 5, right: 5, seat: 1 },
      { left: 5, right: 2, seat: 2 },
      { left: 2, right: 2, seat: 3 },
    ];
    const items = layoutLine(line, 560);
    expect(items.find((i) => i.idx === 1)!.vertical).toBe(true); // in line
    expect(items.find((i) => i.idx === 3)!.vertical).toBe(false); // crosswise
  });

  it("keeps doubles crosswise off a double opening, where nothing clashes", () => {
    // Arms leave a double spinner from its middle, so there is no overlap to
    // avoid and the exception does not apply.
    const line: PlacedTile[] = [
      { left: 5, right: 5, seat: 0, opening: true },
      { left: 5, right: 5, seat: 1 },
    ];
    const items = layoutLine(line, 560);
    expect(items.find((i) => i.idx === 1)!.vertical).toBe(false);
  });

  it("is stable for tiny tables (never loops forever)", () => {
    for (const size of [240, 280]) {
      expect(layoutLine(fullLine(0), size).length).toBe(28);
    }
  });

  it("still places every tile on the table when space runs out", () => {
    // On a small table a long chain cannot coil without touching itself, but it
    // must never lose a tile or spill over the edge.
    for (const size of [300, 360, 420]) {
      for (const seat of SEATS) {
        const items = layoutLine(fullLine(seat), size);
        expect(items.length).toBe(28);
        for (const it of items) {
          const r = rectOf(it);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(size);
          expect(r.y + r.h).toBeLessThanOrEqual(size);
        }
      }
    }
  });
});
