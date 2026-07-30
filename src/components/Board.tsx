"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LastAction, PlacedTile, Seat } from "@/engine/types";
import DominoTile from "./DominoTile";
import { MIN_TABLE, layoutLine } from "./lineLayout";

/**
 * The table: the chain of tiles as it sits in front of the players. Shared by
 * the solo game and the online room so both look and behave identically.
 */
export default function Board({
  line,
  lastAction,
}: {
  line: PlacedTile[];
  lastAction: LastAction | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
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

  return (
    <div className="snake" ref={ref}>
      <div
        className="table-square"
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
