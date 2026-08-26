"use client";

import { useState } from "react";

/** Long enough for a line, short enough to read at a glance. */
export const MAX_TAUNT = 60;

/**
 * The moment before a capicúa lands.
 *
 * You already know you are about to close on both ends — this just gives you
 * somewhere to put it. Saying nothing is the default and costs one tap, so a
 * player who does not care is not held up.
 */
export default function TauntPrompt({
  onPlay,
  onCancel,
}: {
  onPlay: (taunt: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog taunt" onClick={(e) => e.stopPropagation()}>
        <h2>Capicúa</h2>
        <p className="home-sub">Both ends. Care to say anything?</p>

        <input
          autoFocus
          value={text}
          maxLength={MAX_TAUNT}
          placeholder="Optional…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onPlay(text.trim());
            if (e.key === "Escape") onCancel();
          }}
        />

        <div className="taunt-buttons">
          <button className="home-button primary" onClick={() => onPlay(text.trim())}>
            {text.trim() ? "Play it" : "Play it quietly"}
          </button>
          <button className="home-button" onClick={onCancel}>
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}
