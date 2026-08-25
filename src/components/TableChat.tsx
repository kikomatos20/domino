"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatEntry } from "@/server/types";
import type { Seat } from "@/engine/types";

/**
 * Table talk, with the run of play mixed in.
 *
 * Keeping moves and messages in one stream is the point: "nice one" means
 * nothing three tiles later if you cannot see what it was answering.
 */
export default function TableChat({
  chat,
  you,
  onSend,
  busy,
}: {
  chat: ChatEntry[];
  you: Seat;
  onSend: (text: string) => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);

  // Only chat counts as unread; nobody needs a badge for every tile played.
  const talk = chat.filter((c) => c.kind === "chat");
  const unread = open ? 0 : Math.max(0, talk.length - seen);

  useEffect(() => {
    if (open) {
      setSeen(talk.length);
      bottom.current?.scrollIntoView({ block: "nearest" });
    }
  }, [open, chat.length, talk.length]);

  const send = () => {
    const message = text.trim();
    if (!message) return;
    onSend(message);
    setText("");
  };

  return (
    <>
      <button
        className={`chat-toggle ${unread ? "unread" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="Table talk"
      >
        {open ? "Close" : "Chat"}
        {unread > 0 && <span className="chat-badge">{unread}</span>}
      </button>

      {open && (
        <section className="chat-panel" aria-label="Table chat">
          <div className="chat-log">
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
            <div ref={bottom} />
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
        </section>
      )}
    </>
  );
}
