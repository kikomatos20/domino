"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseTile } from "@/engine/engine";
import type { End, Move, TileId } from "@/engine/types";
import DominoTile from "./DominoTile";
import type { EndAnchors } from "./Board";

/** How close to an end you have to drop for it to count. */
const DROP_RADIUS = 90;
/** Movement before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 6;

interface Drag {
  tileId: TileId;
  x: number;
  y: number;
  /** Still might be a tap — no ghost until the finger actually moves. */
  moved: boolean;
}

/**
 * Your tiles, playable by dragging onto either end of the chain.
 *
 * Dragging is the natural gesture for dominoes: pick a tile up, slide it to the
 * end you want. Tapping still works — if a tile fits both ends, tapping lifts it
 * so you can then choose an end, rather than guessing for you.
 */
export default function PlayableHand({
  tiles,
  legalMoves,
  ends,
  yourTurn,
  disabled,
  onPlay,
}: {
  tiles: TileId[];
  legalMoves: Move[];
  ends: EndAnchors;
  yourTurn: boolean;
  disabled?: boolean;
  onPlay: (tileId: TileId, end: End) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [armed, setArmed] = useState<TileId | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const movesFor = useCallback(
    (tileId: TileId) => legalMoves.filter((m) => m.tileId === tileId),
    [legalMoves]
  );
  const playable = useMemo(
    () => new Set(legalMoves.map((m) => m.tileId)),
    [legalMoves]
  );

  const active = drag?.tileId ?? armed;
  const activeEnds = useMemo(
    () => new Set(active ? movesFor(active).map((m) => m.end) : []),
    [active, movesFor]
  );

  /** Which end, if any, the pointer is currently over. */
  const endUnder = useCallback(
    (x: number, y: number): End | null => {
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
    },
    [activeEnds, ends]
  );

  const hovered = drag && drag.moved ? endUnder(drag.x, drag.y) : null;

  // Follow the pointer for the whole gesture, even outside the tile.
  useEffect(() => {
    if (!drag) return;

    const move = (e: PointerEvent) => {
      const moved =
        drag.moved ||
        (start.current
          ? Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) >
            DRAG_THRESHOLD
          : false);
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, moved } : d));
    };

    const up = (e: PointerEvent) => {
      const options = movesFor(drag.tileId);
      const dropped = drag.moved ? endUnder(e.clientX, e.clientY) : null;

      if (dropped) {
        setArmed(null);
        onPlay(drag.tileId, dropped);
      } else if (!drag.moved) {
        // A tap: play it if there is only one way, otherwise arm it so the ends
        // light up and the next tap picks one.
        if (options.length === 1) {
          setArmed(null);
          onPlay(drag.tileId, options[0].end);
        } else {
          setArmed((a) => (a === drag.tileId ? null : drag.tileId));
        }
      }
      setDrag(null);
      start.current = null;
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, endUnder, movesFor, onPlay]);

  // Tapping an end while a tile is armed plays it there.
  useEffect(() => {
    if (!armed) return;
    const click = (e: PointerEvent) => {
      const end = endUnder(e.clientX, e.clientY);
      if (end) {
        onPlay(armed, end);
        setArmed(null);
      }
    };
    window.addEventListener("pointerdown", click);
    return () => window.removeEventListener("pointerdown", click);
  }, [armed, endUnder, onPlay]);

  useEffect(() => {
    if (!yourTurn) setArmed(null);
  }, [yourTurn]);

  const canPlay = (id: TileId) => yourTurn && !disabled && playable.has(id);

  return (
    <>
      <div className={`hand ${disabled ? "sending" : ""}`}>
        {tiles.map((id) => {
          const { a, b } = parseTile(id);
          const usable = canPlay(id);
          const isActive = active === id;
          return (
            <DominoTile
              key={id}
              left={a}
              right={b}
              vertical
              highlight={usable}
              dimmed={yourTurn && !playable.has(id)}
              className={`${usable ? "grabbable" : ""} ${isActive ? "lifted" : ""} ${
                drag?.tileId === id && drag.moved ? "dragging" : ""
              }`}
              onPointerDown={
                usable
                  ? (e) => {
                      start.current = { x: e.clientX, y: e.clientY };
                      setDrag({ tileId: id, x: e.clientX, y: e.clientY, moved: false });
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      {/* Drop targets on the open ends the held tile can actually go on. */}
      {active &&
        (["left", "right"] as End[]).map((end) => {
          const anchor = ends[end];
          if (!anchor || !activeEnds.has(end)) return null;
          return (
            <div
              key={end}
              className={`drop-target ${hovered === end ? "over" : ""}`}
              style={{ left: anchor.x, top: anchor.y }}
              aria-hidden
            >
              <span className="drop-label">{end}</span>
            </div>
          );
        })}

      {/* The tile under your finger. */}
      {drag && drag.moved && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <DominoTile
            left={parseTile(drag.tileId).a}
            right={parseTile(drag.tileId).b}
            vertical
            highlight
          />
        </div>
      )}
    </>
  );
}
