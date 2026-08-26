"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  accountsAvailable,
  currentAccount,
  fetchRecord,
  signIn,
  signOut,
  signUp,
  type Account,
  type PlayRecord,
} from "@/lib/auth";

/**
 * Making and using an account.
 *
 * Nothing here is required to play — a nickname and a room code still get you
 * to a table. An account exists so a result can belong to a person rather than
 * to whatever name they typed that evening.
 */
export default function AccountPanel() {
  const [account, setAccount] = useState<Account | null>(null);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<PlayRecord | null>(null);

  useEffect(() => {
    currentAccount()
      .then(setAccount)
      .finally(() => setLoading(false));
  }, []);

  // Load the record whenever there is somebody to load it for.
  useEffect(() => {
    if (!account) {
      setRecord(null);
      return;
    }
    fetchRecord().then(setRecord);
  }, [account]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = mode === "up" ? await signUp(username, password) : await signIn(username, password);
      setAccount(next);
      // Never keep the password around once it has done its job.
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work");
    } finally {
      setBusy(false);
    }
  };

  if (!accountsAvailable()) {
    return (
      <main className="home">
        <div className="home-card">
          <h1>Accounts</h1>
          <p className="error">Accounts are not configured on this deployment.</p>
          <Link className="home-button" href="/">
            Back
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="home">
      <div className="home-card">
        <h1>{account ? account.username : "Your account"}</h1>

        {loading ? (
          <p className="home-sub">One moment…</p>
        ) : account ? (
          <>
            {record ? (
              <>
                <div className="record-tally">
                  <span className="record-win">{record.won} W</span>
                  <span className="record-loss">{record.lost} L</span>
                  {record.played > 0 && (
                    <span className="record-rate">
                      {Math.round((record.won / record.played) * 100)}%
                    </span>
                  )}
                </div>

                {record.played === 0 ? (
                  <p className="home-sub">
                    Nothing yet. Finish a match to a hundred and it lands here.
                  </p>
                ) : (
                  <ul className="record-list">
                    {record.recent.map((m, i) => (
                      <li key={i} className={`record-row ${m.won ? "won" : "lost"}`}>
                        <span className="record-verdict">{m.won ? "Won" : "Lost"}</span>
                        <span className="record-score">
                          {m.teamScore}–{m.opponentScore}
                        </span>
                        <span className="record-where">
                          {m.solo ? "vs computer" : `with ${m.partnerName ?? "a partner"}`}
                        </span>
                        <span className="record-rounds">
                          {m.rounds} round{m.rounds === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="home-sub">Signed in. Match results are saved to this name.</p>
            )}
            <div className="home-actions">
              <Link className="home-button primary" href="/online">
                Play
              </Link>
              <button
                className="home-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await signOut();
                  setAccount(null);
                  setBusy(false);
                }}
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="home-sub">
              {mode === "up"
                ? "Pick a name and a password. No email, nothing to confirm."
                : "Sign in to keep your record."}
            </p>

            <section className="panel">
              <label className="field">
                <span>Name</span>
                <input
                  value={username}
                  maxLength={16}
                  autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                />
              </label>

              {error && <p className="error">{error}</p>}

              {/* No email means no reset link. Say so before, not after. */}
              {mode === "up" && (
                <p className="home-note">
                  There is no email on file, so there is no way to reset this
                  password. Keep it somewhere you will still have it later.
                </p>
              )}

              <button
                className="home-button primary"
                disabled={busy || !username.trim() || !password}
                onClick={submit}
              >
                {mode === "up" ? "Create account" : "Sign in"}
              </button>

              <button
                className="link"
                onClick={() => {
                  setMode(mode === "up" ? "in" : "up");
                  setError(null);
                }}
              >
                {mode === "up" ? "I already have one" : "Create one instead"}
              </button>
            </section>
          </>
        )}

        <p className="home-note">
          You never need an account to play. A nickname and a room code are
          enough — this only exists so results can be kept.
        </p>
      </div>
    </main>
  );
}
