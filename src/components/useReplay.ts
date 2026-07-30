"use client";

import { useEffect, useRef, useState } from "react";
import type { LastAction, PlacedTile } from "@/engine/types";

/**
 * Time between revealed tiles when catching up on other players' moves. Long
 * enough for the placement animation to land, but shortened when several tiles
 * are waiting — nobody wants to sit through four slow replays before their turn.
 */
const STEP_MS = 1000;
const HURRIED_STEP_MS = 520;

interface Replay {
  line: PlacedTile[];
  lastAction: LastAction | null;
  /** True while tiles are still being revealed — the hand stays locked. */
  catchingUp: boolean;
  /** The tile that just landed, so the table can announce who played it. */
  justPlayed: PlacedTile | null;
}

/**
 * Reveal the chain one tile at a time.
 *
 * The server resolves every computer seat in a single request, so a reply can
 * arrive with three new tiles already on the table. Dropping them all at once
 * makes the game unreadable — you cannot see who played what. This walks the
 * board forward tile by tile instead, so an online table paces like the solo
 * one, without the server having to dribble the moves out.
 *
 * Tiles are only ever added at the two ends, so the difference between what is
 * shown and what has arrived is a prefix and/or a suffix.
 */
export function useReplay(line: PlacedTile[], lastAction: LastAction | null): Replay {
  const [shown, setShown] = useState<PlacedTile[]>(line);
  const [synthetic, setSynthetic] = useState<LastAction | null>(lastAction);
  const [justPlayed, setJustPlayed] = useState<PlacedTile | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A new round (or a rewind) — show it as it is.
    if (line.length === 0 || line.length < shown.length) {
      setShown(line);
      setSynthetic(lastAction);
      return;
    }
    if (line.length === shown.length) {
      setSynthetic(lastAction);
      return;
    }

    const offset = matchOffset(line, shown);
    if (offset === -1) {
      // Cannot line the two up (shouldn't happen); just show the truth.
      setShown(line);
      setSynthetic(lastAction);
      return;
    }

    const missingBefore = offset;
    const missingAfter = line.length - offset - shown.length;
    const backlog = missingBefore + missingAfter;
    const step = backlog > 2 ? HURRIED_STEP_MS : STEP_MS;

    timer.current = setTimeout(() => {
      // Reveal from the back first, then the front — either order reads fine,
      // and this keeps the newest end moving.
      if (missingAfter > 0) {
        const next = line.slice(offset, offset + shown.length + 1);
        const tile = next[next.length - 1];
        setShown(next);
        setJustPlayed(tile);
        setSynthetic({ seat: tile.seat, kind: "play", move: { tileId: "", end: "right" } });
      } else if (missingBefore > 0) {
        const next = line.slice(offset - 1, offset + shown.length);
        const tile = next[0];
        setShown(next);
        setJustPlayed(tile);
        setSynthetic({ seat: tile.seat, kind: "play", move: { tileId: "", end: "left" } });
      }
    }, step);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [line, shown, lastAction]);

  return {
    line: shown,
    lastAction: synthetic,
    catchingUp: shown.length < line.length,
    justPlayed,
  };
}

/** Clear the announcement a moment after the tile lands. */
export function useFading<T>(value: T, ms: number): T | null {
  const [shown, setShown] = useState<T | null>(value);
  useEffect(() => {
    setShown(value);
    if (value === null) return;
    const t = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return shown;
}

/** Where `shown` sits inside `line`, or -1 if it does not. */
function matchOffset(line: PlacedTile[], shown: PlacedTile[]): number {
  if (shown.length === 0) return Math.max(0, line.length - 1);
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
