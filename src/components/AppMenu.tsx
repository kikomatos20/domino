"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  accountsAvailable,
  currentAccount,
  onAccountChange,
  signOut,
  type Account,
} from "@/lib/auth";

/**
 * Getting anywhere from anywhere.
 *
 * Every page had its own way out and the tables had none at all — once a match
 * started the only route home was the browser's back button. This is one small
 * button that opens the same short list everywhere.
 */
/** href, label, accent colour, and a glyph to carry it. */
type Item = [string, string, string, string];

export default function AppMenu({
  className = "",
  /** A match is in progress, so walking away is worth asking about. */
  inGame = false,
}: {
  className?: string;
  inGame?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  /** Where they asked to go, held while we check they meant it. */
  const [leavingTo, setLeavingTo] = useState<string | null>(null);

  /**
   * Follow a link, or stop and ask first.
   *
   * Mid-match, a stray tap on "Home" costs everyone else at the table their
   * game. Everywhere else this is just a link.
   */
  const go = (href: string) => (e: React.MouseEvent) => {
    if (!inGame) return; // let the link do its job
    e.preventDefault();
    setLeavingTo(href);
  };

  // Know who you are from the moment the page loads, so the button itself can
  // say whether you are signed in — and keep up if that changes in another tab.
  useEffect(() => {
    if (!accountsAvailable()) return;
    currentAccount().then(setAccount);
    return onAccountChange(setAccount);
  }, []);

  // Escape closes it, like every other dialog in the app.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  return (
    <>
      <button
        className={`app-menu-button ${className} ${account ? "signed-in" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={account ? `Menu — signed in as ${account.username}` : "Menu"}
        title={account ? `Signed in as ${account.username}` : "Menu"}
      >
        ☰
        {account && (
          // The initial rather than a bare dot: at a glance it says *who*,
          // which matters on a shared laptop.
          <span className="app-menu-who" aria-hidden>
            {account.username.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <nav className="dialog app-menu" onClick={(e) => e.stopPropagation()}>
            <header className="app-menu-head">
              <h2>{account ? account.username : "Domino"}</h2>
              <button
                className="app-menu-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            {/* Accents match the stats page: purple for the computer, blue for
                people, gold for you. */}
            {([
              ["/", "Home", "gold", "🁣"],
              ["/solo", "Play vs Computer", "violet", "🖳"],
              ["/online", "Play with Friends", "sky", "🀱"],
              ...(accountsAvailable()
                ? ([
                    ["/account", account ? "Your record" : "Sign in", "leaf", "★"],
                  ] as Item[])
                : []),
            ] as Item[]).map(([href, label, accent, glyph]) => (
              <Link
                key={href}
                className={`app-menu-item ${accent}`}
                href={href}
                onClick={(e) => {
                  go(href)(e);
                  if (!inGame) setOpen(false);
                }}
              >
                <span className="app-menu-glyph" aria-hidden>
                  {glyph}
                </span>
                {label}
              </Link>
            ))}

            {account && (
              <button
                className="app-menu-item quiet"
                onClick={async () => {
                  await signOut();
                  setAccount(null);
                }}
              >
                Sign out
              </button>
            )}

            {/* Only true if there is actually a table to go back to. */}
            {inGame && (
              <p className="app-menu-note">
                Your seat is kept if you come back to the same room code.
              </p>
            )}
          </nav>
        </div>
      )}

      {leavingTo && (
        <div className="overlay" onClick={() => setLeavingTo(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Leave the table?</h2>
            <p className="home-sub">
              The game carries on without you — the computer will cover your seat.
              Come back to the same room code and you get it back.
            </p>
            <button
              className="home-button primary"
              onClick={() => {
                const href = leavingTo;
                setLeavingTo(null);
                setOpen(false);
                router.push(href);
              }}
            >
              Leave
            </button>
            <button className="home-button" onClick={() => setLeavingTo(null)}>
              Stay
            </button>
          </div>
        </div>
      )}
    </>
  );
}
