"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatEntry } from "@/server/types";
import type { Seat } from "@/engine/types";

/**
 * Table talk, with the run of play mixed in.
 *
 * Keeping moves and messages in one stream is the point: "nice one" means
 * nothing three tiles later if you cannot see what it was answering.
 *
 * The dock lives in the page grid rather than floating over it, so reading the
 * chat never costs you sight of the table. Closing it hands the space back.
 */
export default function TableChat({
  chat,
  you,
  onSend,
  open,
  onToggle,
  busy,
}: {
  chat: ChatEntry[];
  you: Seat;
  onSend: (text: string) => void;
  open: boolean;
  onToggle: () => void;
  busy?: boolean;
}) {
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(0);
  const log = useRef<HTMLDivElement>(null);

  // Only chat counts as unread; nobody needs a badge for every tile played.
  const talk = chat.filter((c) => c.kind === "chat");
  const unread = open ? 0 : Math.max(0, talk.length - seen);

  useEffect(() => {
    if (!open) return;
    setSeen(talk.length);
    // Follow the conversation, but only the log scrolls — never the table.
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, chat.length, talk.length]);

  const send = () => {
    const message = text.trim();
    if (!message) return;
    onSend(message);
    setText("");
  };

  // Out of the way entirely: a pill that gives the whole column back.
  if (!open) {
    return (
      <button
        className={`chat-toggle ${unread ? "unread" : ""}`}
        onClick={onToggle}
        title="Show table talk"
      >
        Chat
        {unread > 0 && <span className="chat-badge">{unread}</span>}
      </button>
    );
  }

  return (
    <aside className="chat-dock" aria-label="Table chat">
      <header className="chat-head">
        <span className="chat-title">Table talk</span>
        <button className="chat-collapse" onClick={onToggle} title="Hide chat">
          Hide
        </button>
      </header>

      <div className="chat-log" ref={log}>
        {chat.length === 0 && <p className="chat-empty">Nothing yet.</p>}
        {chat.map((c) => (
          <div key={c.id} className={`chat-line ${c.kind}`}>
            {c.kind === "chat" ? (
              <>
                <span className={`chat-who ${c.seat === you ? "you" : ""}`}>
                  {c.seat === you ? "You" : c.who}
                </span>
                <span className="chat-text">{c.text}</span>
              </>
            ) : c.kind === "move" ? (
              <span className="chat-move">
                <b>{c.seat === you ? "You" : c.who}</b> {c.text}
              </span>
            ) : (
              <span className="chat-event">{c.text}</span>
            )}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          value={text}
          maxLength={240}
          placeholder="Say something…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button disabled={busy || !text.trim()} onClick={send}>
          Send
        </button>
      </div>
    </aside>
  );
}
