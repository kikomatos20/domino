"use client";

import { useState } from "react";
import type { PlayerView } from "@/server/types";
import type { Seat } from "@/engine/types";
import TableChat from "./TableChat";

const SEAT_LABEL: Record<Seat, string> = {
  0: "South",
  1: "East",
  2: "North",
  3: "West",
};

/** Teams are fixed by seat: South+North against East+West. */
function teamOf(seat: Seat) {
  return seat % 2 === 0 ? "Team A" : "Team B";
}

export default function Lobby({
  view,
  onSeat,
  onSettings,
  onStart,
  onChat,
  busy,
}: {
  view: PlayerView;
  onSeat: (seat: Seat) => void;
  onSettings: (s: { fillWithAi?: boolean; difficulty?: string }) => void;
  onStart: () => void;
  onChat: (text: string) => void;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const isHost = view.you?.isHost ?? false;
  const humans = view.seats.filter((s) => s.nickname).length;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(view.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="home lobby-page">
      <div className="lobby-stack">
      <div className="home-card lobby">
        <h1>Table {view.code}</h1>
        <p className="home-sub">
          Share this code with three friends — or start with computer players.
        </p>

        <button className="code-badge" onClick={copyCode} title="Copy code">
          {view.code}
          <span className="copy-hint">{copied ? "copied" : "tap to copy"}</span>
        </button>

        <div className="seat-grid">
          {view.seats.map((s) => (
            <div
              key={s.seat}
              className={`seat-card ${s.isYou ? "you" : ""} ${s.nickname ? "" : "empty"}`}
            >
              <span className="seat-pos">
                {SEAT_LABEL[s.seat]} · {teamOf(s.seat)}
              </span>
              <span className="seat-who">
                {s.nickname ?? (view.fillWithAi ? "Computer" : "Waiting…")}
                {s.isYou && " (you)"}
              </span>
              {!s.nickname && view.you && (
                <button className="seat-take" disabled={busy} onClick={() => onSeat(s.seat)}>
                  Sit here
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="home-note">
          Partners sit across from each other: South with North, East with West.
        </p>

        {isHost ? (
          <section className="panel">
            <label className="check">
              <input
                type="checkbox"
                checked={view.fillWithAi}
                disabled={busy}
                onChange={(e) => onSettings({ fillWithAi: e.target.checked })}
              />
              <span>Fill empty seats with the computer</span>
            </label>
            {view.fillWithAi && (
              <label className="field inline">
                <span>Computer skill</span>
                <select
                  value={view.difficulty}
                  disabled={busy}
                  onChange={(e) => onSettings({ difficulty: e.target.value })}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            )}
            <button
              className="home-button primary"
              disabled={busy || (!view.fillWithAi && humans < 4)}
              onClick={onStart}
            >
              {!view.fillWithAi && humans < 4
                ? `Waiting for players (${humans}/4)`
                : "Start match"}
            </button>
          </section>
        ) : (
          <p className="waiting">Waiting for the host to start…</p>
        )}
      </div>

      {view.you && (
        <TableChat
          chat={view.chat ?? []}
          you={view.you.seat}
          onSend={onChat}
          open={chatOpen}
          onToggle={() => setChatOpen((o) => !o)}
          busy={busy}
        />
      )}
      </div>
    </main>
  );
}
