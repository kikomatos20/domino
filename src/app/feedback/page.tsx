"use client";

import { useCallback, useEffect, useState } from "react";

interface Item {
  id: string;
  created_at: string;
  kind: string;
  message: string;
  rating: number | null;
  nickname: string | null;
  room_code: string | null;
  mode: string | null;
  context: { about?: string; payload?: unknown; screen?: unknown; userAgent?: string } | null;
  app_version: string | null;
  resolved: boolean;
}

const KEY_STORE = "domino:feedbackKey";

/**
 * Everything players have told us, newest first.
 *
 * Each entry carries the position it was written about, so a complaint can be
 * copied straight into a test rather than guessed at.
 */
export default function FeedbackPage() {
  const [key, setKey] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [openOnly, setOpenOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setKey(window.localStorage.getItem(KEY_STORE) ?? "");
  }, []);

  const load = useCallback(
    async (withKey: string) => {
      setError(null);
      try {
        const res = await fetch(
          `/api/feedback/list?key=${encodeURIComponent(withKey)}&open=${openOnly ? 1 : 0}`
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Could not load");
        window.localStorage.setItem(KEY_STORE, withKey);
        setItems(body.items);
      } catch (e) {
        setItems(null);
        setError(e instanceof Error ? e.message : "Could not load");
      }
    },
    [openOnly]
  );

  useEffect(() => {
    if (key) load(key);
    // Reload when the filter changes, but do not nag before a key is entered.
  }, [openOnly, key, load]);

  const resolve = async (id: string, resolved: boolean) => {
    await fetch(`/api/feedback/list?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, resolved }),
    });
    load(key);
  };

  return (
    <main className="feedback-page">
      <header className="feedback-head">
        <h1>Feedback</h1>
        <div className="feedback-controls">
          <input
            type="password"
            placeholder="Access key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button onClick={() => load(key)}>Load</button>
          <label className="check">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
            <span>Unresolved only</span>
          </label>
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {items && items.length === 0 && <p className="home-sub">Nothing yet.</p>}

      <div className="feedback-list">
        {items?.map((item) => (
          <article key={item.id} className={`feedback-item ${item.resolved ? "done" : ""}`}>
            <div className="feedback-item-head">
              <span className={`kind ${item.kind}`}>{item.kind}</span>
              {item.rating !== null && (
                <span className="kind">
                  {item.rating > 0 ? "good" : item.rating < 0 ? "bad" : "mixed"}
                </span>
              )}
              <span className="who">
                {item.nickname ?? "anon"}
                {item.mode ? ` · ${item.mode}` : ""}
                {item.room_code ? ` · ${item.room_code}` : ""}
              </span>
              <span className="when">{new Date(item.created_at).toLocaleString()}</span>
            </div>

            {item.context?.about && <p className="feedback-about">{item.context.about}</p>}
            <p className="feedback-message">{item.message}</p>

            <div className="feedback-actions">
              <button
                className="link"
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
              >
                {expanded === item.id ? "Hide position" : "Show position"}
              </button>
              <button className="link" onClick={() => resolve(item.id, !item.resolved)}>
                {item.resolved ? "Reopen" : "Mark done"}
              </button>
            </div>

            {expanded === item.id && (
              <pre className="feedback-json">
                {JSON.stringify(item.context?.payload ?? {}, null, 2)}
              </pre>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
