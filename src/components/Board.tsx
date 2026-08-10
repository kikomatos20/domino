"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LastAction, PlacedTile, Seat } from "@/engine/types";
import DominoTile from "./DominoTile";
import { MIN_TABLE, TILE_LONG, TILE_SHORT, layoutLine } from "./lineLayout";

/**
 * The table: the chain of tiles as it sits in front of the players. Shared by
 * the solo game and the online room so both look and behave identically.
 */
/** Where each open end of the chain sits on screen, for dropping tiles onto. */
export interface EndAnchors {
  left: { x: number; y: number } | null;
  right: { x: number; y: number } | null;
}

export default function Board({
  line,
  lastAction,
  onEnds,
}: {
  line: PlacedTile[];
  lastAction: LastAction | null;
  /** Reports the screen position of both open ends whenever they move. */
  onEnds?: (ends: EndAnchors) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The table is square (1:1), so the chain has the same room in every direction.
  const size = Math.max(240, Math.min(box.w, box.h));
  // Lay the chain out on a table big enough to hold all 28 tiles, then scale the
  // whole thing to fit. Tile size is fixed for the entire round either way.
  const virtual = Math.max(MIN_TABLE, size);
  const scale = size / virtual;
  const items = useMemo(() => layoutLine(line, virtual), [line, virtual]);

  const lastIdx =
    lastAction?.kind === "play"
      ? lastAction.move!.end === "left"
        ? 0
        : line.length - 1
      : null;

  const FROM: Record<Seat, [string, string]> = {
    0: ["0px", "150px"],
    1: ["150px", "0px"],
    2: ["0px", "-150px"],
    3: ["-150px", "0px"],
  };

  // Tell the hand where the two ends are, in screen coordinates, so a dragged
  // tile can be dropped onto one of them. Recomputed whenever the chain or the
  // table geometry changes.
  useEffect(() => {
    if (!onEnds) return;
    const table = tableRef.current;
    if (!table || items.length === 0) {
      onEnds?.({ left: null, right: null });
      return;
    }
    const rect = table.getBoundingClientRect();
    const VEC: Record<string, [number, number]> = {
      R: [1, 0],
      D: [0, 1],
      L: [-1, 0],
      U: [0, -1],
    };

    /**
     * A point just beyond the open end, where the next tile would actually go.
     * Sitting it outside the chain keeps the two targets apart even when the
     * table holds nothing but the spinner, where both ends are the same tile.
     */
    const anchor = (idx: number, isRightEnd: boolean) => {
      const it = items.find((i) => i.idx === idx);
      if (!it) return null;
      const w = it.vertical ? TILE_SHORT : TILE_LONG;
      const h = it.vertical ? TILE_LONG : TILE_SHORT;
      // The opening tile stores the forward direction, so the left end has to
      // look the other way.
      const flip = it.arm === "open" && !isRightEnd;
      const [dx, dy] = VEC[it.dir] ?? [1, 0];
      const reach = (Math.abs(dx) ? w : h) / 2 + TILE_SHORT;
      const sign = flip ? -1 : 1;
      return {
        x: rect.left + (it.x + w / 2 + dx * sign * reach) * scale,
        y: rect.top + (it.y + h / 2 + dy * sign * reach) * scale,
      };
    };
    onEnds({ left: anchor(0, false), right: anchor(line.length - 1, true) });
  }, [items, scale, line.length, onEnds, box.w, box.h]);

  return (
    <div className="snake" ref={ref}>
      <div
        className="table-square"
        ref={tableRef}
        style={{
          width: virtual,
          height: virtual,
          // The box keeps its full size for layout purposes, so it is centred
          // explicitly rather than by the parent — otherwise the scaled-down
          // table drifts off centre and gets clipped on small screens.
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {items.map(({ p, idx, vertical, reversed, x, y }) => {
          const lastPlayed = idx === lastIdx;
          const [fx, fy] = FROM[p.seat];
          const l = reversed ? p.right : p.left;
          const r = reversed ? p.left : p.right;
          return (
            <div
              key={`${Math.min(p.left, p.right)}-${Math.max(p.left, p.right)}`}
              className="snake-slot"
              style={{ left: x, top: y }}
            >
              <DominoTile
                left={l}
                right={r}
                vertical={vertical}
                small
                highlight={lastPlayed}
                className={lastPlayed ? "just-played" : ""}
                style={
                  lastPlayed
                    ? ({ "--fx": fx, "--fy": fy } as React.CSSProperties)
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
