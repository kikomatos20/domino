"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppMenu from "./AppMenu";
import {
  AVATAR_COLOURS,
  accountsAvailable,
  currentAccount,
  fetchRecord,
  setColour,
  signIn,
  signOut,
  signUp,
  type Account,
  type PlayRecord,
  type Stats,
} from "@/lib/auth";
import StatsPanel from "./StatsPanel";

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
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    currentAccount()
      .then(setAccount)
      .finally(() => setLoading(false));
  }, []);

  // Load the record whenever there is somebody to load it for.
  useEffect(() => {
    if (!account) {
      setRecord(null);
      setStats(null);
      return;
    }
    fetchRecord().then((data) => {
      setRecord(data?.record ?? null);
      setStats(data?.stats ?? null);
    });
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
      <AppMenu className="corner" />
      <div className="home-card">
        {/* The name lives in the profile card below when signed in. */}
        {!account && <h1>Your account</h1>}

        {loading ? (
          <p className="home-sub">One moment…</p>
        ) : account ? (
          <>
            {/* Who you are, always — not only once there are results. */}
            <div className="profile" style={{ "--me": account.colour } as React.CSSProperties}>
              <span className="profile-avatar">
                {account.username.slice(0, 1).toUpperCase()}
              </span>
              <span className="profile-lines">
                <span className="profile-name">{account.username}</span>
                <span className="profile-sub">
                  {stats
                    ? `${stats.online.played + stats.solo.played} matches played`
                    : "Signed in"}
                </span>
                <span className="swatches">
                  {AVATAR_COLOURS.map((c) => (
                    <button
                      key={c}
                      className={`swatch ${account.colour === c ? "on" : ""}`}
                      style={{ background: c }}
                      aria-label={`Use this colour`}
                      aria-pressed={account.colour === c}
                      onClick={async () => {
                        setAccount({ ...account, colour: c });
                        await setColour(c);
                      }}
                    />
                  ))}
                </span>
              </span>
            </div>

            {stats ? (
              <StatsPanel stats={stats} />
            ) : (
              <p className="home-sub">
                Could not load your stats just now. They are safe — try again in
                a moment.
              </p>
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
