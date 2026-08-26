"use client";

import { useEffect, useState } from "react";
import DominoTile from "./DominoTile";
import { parseTile } from "@/engine/engine";
import type { TileId } from "@/engine/types";

/** How long the moment holds before the round-over dialog takes over. */
export const CAPICUA_MS = 2600;

/**
 * The capicúa: closing on a tile that fitted both open ends.
 *
 * It is worth no extra points under these rules, so this is the whole reward —
 * which is reason enough to make it land properly. The board dims, the tile
 * that did it comes forward, and the two numbers it joined are named, because
 * the point is not that someone won but *how*.
 */
export default function CapicuaMoment({
  tileId,
  who,
  ends,
  onDone,
}: {
  tileId: TileId;
  /** "You" or a player's name. */
  who: string;
  /** The two ends it closed on, which are what made it a capicúa. */
  ends: [number, number];
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const { a, b } = parseTile(tileId);

  useEffect(() => {
    // Fade out slightly before handing over, so the two never overlap.
    const fade = setTimeout(() => setLeaving(true), CAPICUA_MS - 400);
    const done = setTimeout(onDone, CAPICUA_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      className={`capicua ${leaving ? "leaving" : ""}`}
      role="status"
      aria-live="polite"
      // Tapping moves it along for anyone who has seen it before.
      onClick={onDone}
    >
      <div className="capicua-tile">
        <DominoTile left={a} right={b} highlight />
      </div>
      <p className="capicua-word">¡Capicúa!</p>
      <p className="capicua-detail">
        {who} closed on the {ends[0]} and the {ends[1]}
      </p>
    </div>
  );
}
