"use client";

import { parseTile } from "@/engine/engine";
import type { TileId } from "@/engine/types";
import DominoTile from "./DominoTile";

/** How long a press has to last before it counts as a hold rather than a tap. */
export const HOLD_MS = 380;

/**
 * A tile blown up in the middle of the screen, for when the pips are too small
 * to read — which they are on a phone, especially for tiles out on the table.
 */
export default function ZoomedTile({
  tileId,
  vertical = true,
  onClose,
}: {
  tileId: TileId;
  vertical?: boolean;
  onClose: () => void;
}) {
  const { a, b } = parseTile(tileId);
  return (
    <div
      className="zoom-overlay"
      onPointerDown={onClose}
      onPointerUp={onClose}
      onPointerCancel={onClose}
      aria-hidden
    >
      <div className="zoom-tile">
        <DominoTile left={a} right={b} vertical={vertical} />
      </div>
    </div>
  );
}
