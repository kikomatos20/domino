"use client";

import { useRef, useState } from "react";
import { useModal } from "./useModal";

/**
 * The end-of-round dialog, with a way to step out of it and look at the table:
 * everyone's leftover tiles are face up there, underneath the dialog.
 */
export default function RoundOverlay({ children }: { children: React.ReactNode }) {
  const [peeking, setPeeking] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // No Escape: the round result has to be acted on, not dismissed.
  useModal(boxRef, undefined, !peeking);

  if (peeking) {
    return (
      <button className="peek-back" onClick={() => setPeeking(false)}>
        Back to results
      </button>
    );
  }

  return (
    <div className="overlay">
      <div className="dialog" ref={boxRef} role="dialog" aria-modal="true" aria-label="Round over">
        {children}
        <button className="link" onClick={() => setPeeking(true)}>
          See everyone&apos;s tiles
        </button>
      </div>
    </div>
  );
}
