"use client";

import { useEffect, useRef, useState } from "react";
import { useModal } from "./useModal";

/** How long the finished board stays on its own before the results card. */
export const LINGER_MS = 4000;

/**
 * The end-of-round results.
 *
 * The board comes first: for `delayMs` the table stays as it finished, every
 * hand face up where it sits with its pip total, and nothing on top of it.
 * Then a compact card rises from the bottom, under the table rather than over
 * it, so the leftover tiles stay in view. "See everyone's tiles" still steps
 * the card aside entirely.
 */
export default function RoundOverlay({
  children,
  delayMs = 0,
}: {
  children: React.ReactNode;
  delayMs?: number;
}) {
  const [peeking, setPeeking] = useState(false);
  const [shown, setShown] = useState(delayMs <= 0);
  const boxRef = useRef<HTMLDivElement>(null);
  // No Escape: the round result has to be acted on, not dismissed.
  useModal(boxRef, undefined, shown && !peeking);

  useEffect(() => {
    if (shown) return;
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [shown, delayMs]);

  if (!shown) return null;

  if (peeking) {
    return (
      <button className="peek-back" onClick={() => setPeeking(false)}>
        Back to results
      </button>
    );
  }

  return (
    <div className="overlay round-over">
      <div className="dialog" ref={boxRef} role="dialog" aria-modal="true" aria-label="Round over">
        {children}
        <button className="link" onClick={() => setPeeking(true)}>
          See everyone&apos;s tiles
        </button>
      </div>
    </div>
  );
}
