"use client";

import { useState } from "react";
import FeedbackForm from "./FeedbackForm";
import type { FeedbackContext } from "./FeedbackForm";

/**
 * Always-available way to say something is wrong, without leaving the game.
 * Whatever the caller passes as `context` travels with the message.
 */
export default function FeedbackButton({
  context,
  label = "Feedback",
  /** Sit in a toolbar instead of floating, so it cannot cover anything. */
  inline = false,
  className,
}: {
  context: () => FeedbackContext;
  label?: string;
  inline?: boolean;
  /** Overrides the look, e.g. to sit in the menu as one of its rows. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<FeedbackContext | null>(null);

  return (
    <>
      <button
        className={className ?? (inline ? "chat-collapse" : "feedback-fab")}
        title="Send feedback"
        onClick={() => {
          // Grab the position as it is right now, before any dialog changes it.
          setSnapshot(context());
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && snapshot && (
        <FeedbackForm context={snapshot} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
