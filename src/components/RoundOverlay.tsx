"use client";

import { useState } from "react";

/**
 * The end-of-round dialog, with a way to step out of it and look at the table:
 * everyone's leftover tiles are face up there, underneath the dialog.
 */
export default function RoundOverlay({ children }: { children: React.ReactNode }) {
  const [peeking, setPeeking] = useState(false);

  if (peeking) {
    return (
      <button className="peek-back" onClick={() => setPeeking(false)}>
        Back to results
      </button>
    );
  }

  return (
    <div className="overlay">
      <div className="dialog">
        {children}
        <button className="link" onClick={() => setPeeking(true)}>
          See everyone&apos;s tiles
        </button>
      </div>
    </div>
  );
}
