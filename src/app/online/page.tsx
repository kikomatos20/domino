"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createRoom, joinRoom, saveNickname, savedNickname } from "@/lib/client";

export default function OnlinePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [fillWithAi, setFillWithAi] = useState(true);
  const [difficulty, setDifficulty] = useState("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [health, setHealth] = useState<string | null>(null);

  useEffect(() => {
    setNickname(savedNickname());
    // Surface a broken backend here, rather than three moves into a game.
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setHealth(h?.ready ? null : (h?.detail ?? null)))
      .catch(() => {});
  }, []);

  const run = async (fn: () => Promise<string>) => {
    setError(null);
    if (!nickname.trim()) return setError("Pick a nickname first");
    setBusy(true);
    try {
      saveNickname(nickname.trim());
      router.push(`/room/${await fn()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <main className="home">
      <div className="home-card">
        <Link href="/" className="back-link">
          ← Back
        </Link>
        <h1>Play with Friends</h1>

        {health && <p className="warn">{health}</p>}

        <label className="field">
          <span>Your name</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={16}
            placeholder="Kiko"
          />
        </label>

        <section className="panel">
          <h2>Start a new table</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={fillWithAi}
              onChange={(e) => setFillWithAi(e.target.checked)}
            />
            <span>Fill empty seats with the computer</span>
          </label>
          {fillWithAi && (
            <label className="field inline">
              <span>Computer skill</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          )}
          <button
            className="home-button primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const room = await createRoom({
                  nickname: nickname.trim(),
                  fillWithAi,
                  difficulty,
                });
                return room.code;
              })
            }
          >
            Create table
          </button>
        </section>

        <section className="panel">
          <h2>Join a table</h2>
          <label className="field">
            <span>Room code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="code-input"
            />
          </label>
          <button
            className="home-button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const clean = code.trim().toUpperCase();
                if (clean.length !== 6) throw new Error("Room codes are six characters");
                await joinRoom(clean, nickname.trim());
                return clean;
              })
            }
          >
            Join table
          </button>
        </section>

        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
