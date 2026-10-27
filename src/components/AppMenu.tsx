"use client";

import { useEffect, useRef, useState } from "react";
import { useModal } from "./useModal";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  accountsAvailable,
  currentAccount,
  fetchRecord,
  onAccountChange,
  signOut,
  type Account,
  type Stats,
} from "@/lib/auth";
import AchievementList from "./AchievementList";
import Icon, { type IconName } from "./Icon";
import HowToPlay from "./HowToPlay";
import { LOOKS, applyLook, readLook, type Look } from "@/lib/look";

/**
 * Getting anywhere from anywhere.
 *
 * Every page had its own way out and the tables had none at all — once a match
 * started the only route home was the browser's back button. This is one small
 * button that opens the same short list everywhere.
 */
/** href, label, accent colour, and a glyph to carry it. */
type Item = [string, string, string, IconName];

export default function AppMenu({
  className = "",
  /** A match is in progress, so walking away is worth asking about. */
  inGame = false,
  children,
}: {
  className?: string;
  inGame?: boolean;
  /** Settings for the table you are at (difficulty, room code), shown first. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  /** Where they asked to go, held while we check they meant it. */
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  /**
   * Achievements, shown over the table rather than on a page of their own.
   *
   * Walking to /account mid-match means leaving the table, which costs everyone
   * else the game. The badges are the one part of the record you actually want
   * while playing — you are three rounds from silver and it would be good to
   * know that now — so they open in place and close again.
   */
  const [badges, setBadges] = useState<Stats | null>(null);
  const [loadingBadges, setLoadingBadges] = useState(false);
  /** Portals need a document, which the server render does not have. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  /** The table look, read once the page is in the browser. */
  const [look, setLook] = useState<Look>("a");
  const [rules, setRules] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const badgesRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<HTMLDivElement>(null);
  useModal(menuRef, () => setOpen(false), open);
  useModal(badgesRef, () => setBadges(null), Boolean(badges || loadingBadges));
  useModal(leaveRef, () => setLeavingTo(null), Boolean(leavingTo));
  useEffect(() => setLook(readLook()), []);

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

  // Escape closes whichever of these is showing, like every other dialog here.
  useEffect(() => {
    if (!open && !badges) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setBadges(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, badges]);

  /**
   * Dialogs go straight to the body.
   *
   * This button lives in the scoreboard, and a `position: fixed` overlay
   * rendered there is still subject to any ancestor that creates a stacking
   * context or a containing block — which is how the tiles ended up painted on
   * top of the menu. A portal steps outside all of it.
   */
  const portal = (node: React.ReactNode) =>
    mounted ? createPortal(node, document.body) : null;

  return (
    <>
      <button
        className={`app-menu-button ${className} ${account ? "signed-in" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={account ? `Menu — signed in as ${account.username}` : "Menu"}
        title={account ? `Signed in as ${account.username}` : "Menu"}
      >
        <Icon name="menu" />
        {account && (
          // The initial rather than a bare dot: at a glance it says *who*,
          // which matters on a shared laptop.
          <span
            className="app-menu-who"
            style={{ background: account.colour }}
            aria-hidden
          >
            {account.username.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>

      {open && portal(
        <div className="overlay" onClick={() => setOpen(false)}>
          <nav
            className="dialog app-menu"
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-menu-head">
              <h2>{account ? account.username : "Domino"}</h2>
              <button
                className="app-menu-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </header>

            {children && <section className="app-menu-table">{children}</section>}

            {/* Accents match the stats page: purple for the computer, blue for
                people, gold for you. */}
            {([
              ["/", "Home", "gold", "home"],
              ["/solo", "Play vs Computer", "violet", "computer"],
              ["/online", "Play with Friends", "sky", "friends"],
              ...(accountsAvailable()
                ? ([
                    ["/account", account ? "Your record" : "Sign in", "leaf", "record"],
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
                  <Icon name={glyph} />
                </span>
                {label}
              </Link>
            ))}

            {/* Opens here rather than navigating — the whole point is not
                leaving the table to look. */}
            {account && (
              <button
                className="app-menu-item amber"
                onClick={async () => {
                  setOpen(false);
                  setLoadingBadges(true);
                  try {
                    const data = await fetchRecord();
                    setBadges(data?.stats ?? null);
                  } finally {
                    setLoadingBadges(false);
                  }
                }}
              >
                <span className="app-menu-glyph" aria-hidden>
                  <Icon name="medal" />
                </span>
                Achievements
              </button>
            )}

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

            {/* The look changes in place, mid-match included: it is only colour. */}
            <section className="look-picker" aria-labelledby="look-picker-title">
              <h3 id="look-picker-title">Table look</h3>
              <div className="look-options">
                {LOOKS.map((l) => (
                  <button
                    key={l.id}
                    className={`look-option ${look === l.id ? "on" : ""}`}
                    data-look={l.id}
                    aria-pressed={look === l.id}
                    onClick={() => {
                      applyLook(l.id);
                      setLook(l.id);
                    }}
                  >
                    <span className="look-swatch" aria-hidden>
                      <span className="look-felt">
                        <span className="look-tile" />
                      </span>
                    </span>
                    <span className="look-text">
                      <span className="look-name">{l.name}</span>
                      <span className="look-note">{l.note}</span>
                    </span>
                    {look === l.id && <Icon name="check" size={18} />}
                  </button>
                ))}
              </div>
            </section>

            <button
              className="app-menu-item quiet how-to-open"
              onClick={() => {
                setOpen(false);
                setRules(true);
              }}
            >
              <span className="app-menu-glyph" aria-hidden>
                <Icon name="book" />
              </span>
              How to play
            </button>

            {/* Only true if there is actually a table to go back to. */}
            {inGame && (
              <p className="app-menu-note">
                Your seat is kept if you come back to the same room code.
              </p>
            )}
          </nav>
        </div>
      )}

      {(badges || loadingBadges) && portal(
        <div
          className="overlay"
          onClick={() => {
            setBadges(null);
            setLoadingBadges(false);
          }}
        >
          <div
            className="dialog badges-dialog"
            ref={badgesRef}
            role="dialog"
            aria-modal="true"
            aria-label="Achievements"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-menu-head">
              <h2>Achievements</h2>
              <button
                className="app-menu-close"
                onClick={() => setBadges(null)}
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </header>

            {loadingBadges ? (
              <p className="home-sub">Reading your record…</p>
            ) : badges ? (
              <AchievementList list={badges.achievements} heading={false} />
            ) : (
              <p className="home-sub">
                Could not reach your record just now. The game is unaffected.
              </p>
            )}
          </div>
        </div>
      )}

      {rules && portal(<HowToPlay onClose={() => setRules(false)} />)}

      {leavingTo && portal(
        <div className="overlay" onClick={() => setLeavingTo(null)}>
          <div
            className="dialog"
            ref={leaveRef}
            role="dialog"
            aria-modal="true"
            aria-label="Leave the table?"
            onClick={(e) => e.stopPropagation()}
          >
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
