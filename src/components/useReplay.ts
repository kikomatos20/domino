"use client";

import { useEffect, useRef, useState } from "react";
import type { LastAction, PlacedTile } from "@/engine/types";
import { replayFrom, revealedEnd } from "./replayOrder";

/**
 * Time between revealed tiles when catching up on other players' moves. Long
 * enough for the placement animation to land, but shortened when several tiles
 * are waiting — nobody wants to sit through four slow replays before their turn.
 */
const STEP_MS = 1600;
const HURRIED_STEP_MS = 1000;

export interface ReplayOptions {
  /** Which round these tiles belong to; a change means a fresh deal. */
  round: number;
  /**
   * True when this table started in front of us rather than being joined
   * halfway through. Someone opening the page onto a game already in progress
   * should see it as it stands, not sit through twenty tiles of replay.
   */
  fromStart: boolean;
}

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
export function useReplay(
  line: PlacedTile[],
  lastAction: LastAction | null,
  opts: ReplayOptions
): Replay {
  const { round, fromStart } = opts;
  /**
   * What has been shown so far.
   *
   * Starting this at `line` was the bug behind "I am pie but all three pieces
   * were already on the board": the server resolves every computer seat before
   * handing back the first view, so the table mounts with tiles already down
   * and there is nothing left to replay. When we know the round started under
   * us, begin from an empty table and walk it forward instead.
   */
  const [shown, setShown] = useState<PlacedTile[]>(fromStart ? [] : line);
  const [synthetic, setSynthetic] = useState<LastAction | null>(lastAction);
  const [justPlayed, setJustPlayed] = useState<PlacedTile | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenRound = useRef<number>(round);

  useEffect(() => {
    // A fresh deal. The computers may already have opened it, so rewind to an
    // empty table and let the tiles land one at a time.
    if (seenRound.current !== round) {
      seenRound.current = round;
      setShown([]);
      setSynthetic(null);
      setJustPlayed(null);
      return;
    }

    // A rewind we did not expect — show the truth rather than guess.
    if (line.length === 0 || line.length < shown.length) {
      setShown(line);
      setSynthetic(lastAction);
      return;
    }
    if (line.length === shown.length) {
      setSynthetic(lastAction);
      return;
    }

    const backlog = line.length - shown.length;
    const step = backlog > 2 ? HURRIED_STEP_MS : STEP_MS;

    timer.current = setTimeout(() => {
      const next = replayFrom(line, shown);
      if (next.length === shown.length) {
        setShown(line);
        setSynthetic(lastAction);
        return;
      }
      const end = revealedEnd(shown, next);
      const tile = end === "left" ? next[0] : next[next.length - 1];
      setShown(next);
      setJustPlayed(tile);
      setSynthetic({ seat: tile.seat, kind: "play", move: { tileId: "", end } });
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
