"use client";

import { useEffect, useState } from "react";
import { savedNickname } from "@/lib/client";

export interface FeedbackContext {
  kind: "general" | "review" | "bug";
  /** Shown at the top so people know what they are commenting on. */
  about?: string;
  roomCode?: string | null;
  mode?: "solo" | "online";
  /** Anything that helps reproduce it — position, verdict, and so on. */
  payload?: unknown;
}

/**
 * A note from a player, sent with the position attached.
 *
 * Written feedback about a game is nearly useless without the board it refers
 * to, and nobody is going to describe seven tiles by hand. Whatever the app
 * knows at the moment they hit the button travels with the message.
 */
export default function FeedbackForm({
  context,
  onClose,
}: {
  context: FeedbackContext;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(onClose, 1400);
    return () => clearTimeout(t);
  }, [sent, onClose]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: context.kind,
          message,
          rating,
          nickname: savedNickname() || null,
          roomCode: context.roomCode ?? null,
          mode: context.mode ?? null,
          context: {
            about: context.about ?? null,
            payload: context.payload ?? null,
            screen:
              typeof window !== "undefined"
                ? { w: window.innerWidth, h: window.innerHeight }
                : null,
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent : null,
            at: new Date().toISOString(),
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not send that");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog feedback" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <>
            <h2>Thanks</h2>
            <p className="home-sub">Sent, with the position attached.</p>
          </>
        ) : (
          <>
            <h2>
              {context.kind === "review"
                ? "Something off about this verdict?"
                : context.kind === "bug"
                  ? "Report a problem"
                  : "Tell us what you think"}
            </h2>

            {context.about && <p className="feedback-about">{context.about}</p>}

            <div className="rating-row">
              {[
                { value: 1, label: "Good" },
                { value: 0, label: "Mixed" },
                { value: -1, label: "Bad" },
              ].map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={rating === r.value}
                  className={`rating ${rating === r.value ? "on" : ""}`}
                  // Tapping again keeps the choice rather than clearing it. It
                  // used to toggle off, so a second tap on the same button —
                  // easy if you could not tell the first had registered —
                  // silently threw the rating away.
                  onClick={() => setRating(r.value)}
                >
                  {rating === r.value ? "✓ " : ""}
                  {r.label}
                </button>
              ))}
              {rating !== null && (
                <button type="button" className="rating clear" onClick={() => setRating(null)}>
                  Clear
                </button>
              )}
            </div>

            <textarea
              className="feedback-text"
              rows={5}
              maxLength={2000}
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                context.kind === "review"
                  ? "What should it have said? e.g. both ends were 4s, so the side made no difference."
                  : "What happened, or what would make it better?"
              }
            />

            <p className="feedback-note">
              The current position is sent with this so the exact hand can be
              replayed.
            </p>

            {error && <p className="error">{error}</p>}

            <div className="dialog-buttons">
              <button className="link" onClick={onClose}>
                Cancel
              </button>
              <button disabled={sending || !message.trim()} onClick={send}>
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
