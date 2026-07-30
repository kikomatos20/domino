"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { act, fetchView, joinRoom, saveNickname, savedNickname, savedToken } from "@/lib/client";
import type { PlayerView } from "@/server/types";
import type { End, Seat, TileId } from "@/engine/types";
import Lobby from "./Lobby";
import OnlineTable from "./OnlineTable";

/** How often to re-read the room. Realtime pings shorten this in practice. */
const POLL_MS = 1500;
const PING_MS = 20000;

export default function RoomClient({ code }: { code: string }) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState("");
  const version = useRef(-1);

  const misses = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    // Never poll over the top of our own action — the reply to that is newer
    // than anything a poll started earlier can return.
    if (inFlight.current) return;
    try {
      const next = await fetchView(code);
      misses.current = 0;
      // Only move forward. Replies can arrive out of order, and re-applying a
      // version we already have just churns the UI — which is what made the
      // table feel jumpy.
      setView((current) => {
        if (current && next.version <= version.current) return current;
        version.current = next.version;
        return next;
      });
    } catch (e) {
      // A single failed poll is usually a blip — a dropped connection, a cold
      // start. Only give up after several in a row, and never mid-game on the
      // strength of one bad reply.
      misses.current += 1;
      if (misses.current >= 4) {
        setFatal(e instanceof Error ? e.message : "Could not reach the table");
      }
    }
  }, [code]);

  useEffect(() => {
    setNickname(savedNickname());
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    return () => clearInterval(poll);
  }, [refresh]);

  // Tell the table we are still here, so our seat is not treated as abandoned.
  useEffect(() => {
    if (!savedToken(code)) return;
    const ping = setInterval(() => {
      act(code, { action: "ping" }).catch(() => {});
    }, PING_MS);
    return () => clearInterval(ping);
  }, [code]);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      inFlight.current = true;
      try {
        const next = await act(code, payload);
        // Our own action is always the newest thing we know about.
        if (next) {
          version.current = next.version;
          setView(next);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not work");
        // Re-read: the table has probably moved on without us.
        refresh();
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [code, refresh]
  );

  if (fatal) {
    return (
      <main className="home">
        <div className="home-card">
          <h1>Table {code}</h1>
          <p className="error">{fatal}</p>
          <Link className="home-button" href="/online">
            Back
          </Link>
        </div>
      </main>
    );
  }

  if (!view) {
    return <main className="table-root loading">Finding the table…</main>;
  }

  // Arrived by link without a seat: offer to join.
  if (!view.you) {
    const full = view.seats.every((s) => s.nickname);
    return (
      <main className="home">
        <div className="home-card">
          <h1>Table {view.code}</h1>
          {view.status !== "lobby" ? (
            <p className="home-sub">This game has already started.</p>
          ) : full ? (
            <p className="home-sub">This table is full.</p>
          ) : (
            <>
              <p className="home-sub">Join this table.</p>
              <label className="field">
                <span>Your name</span>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={16}
                  placeholder="Kiko"
                />
              </label>
              <button
                className="home-button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    saveNickname(nickname.trim());
                    const { view: next } = await joinRoom(view.code, nickname.trim());
                    version.current = next.version;
                    setView(next);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not join");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Join table
              </button>
            </>
          )}
          {error && <p className="error">{error}</p>}
          <Link className="back-link" href="/online">
            ← Back
          </Link>
        </div>
      </main>
    );
  }

  if (view.status === "lobby" || !view.game) {
    return (
      <Lobby
        view={view}
        busy={busy}
        onSeat={(seat: Seat) => send({ action: "seat", seat })}
        onSettings={(s) => send({ action: "settings", ...s })}
        onStart={() => send({ action: "start" })}
      />
    );
  }

  return (
    <OnlineTable
      view={view}
      busy={busy}
      error={error}
      onMove={(tileId: TileId, end: End) => send({ action: "move", tileId, end })}
      onPass={() => send({ action: "pass" })}
      onNextRound={() => send({ action: "nextRound" })}
    />
  );
}
