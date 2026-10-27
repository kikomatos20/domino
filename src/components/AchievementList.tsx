"use client";

import { useState } from "react";
import { nextUp } from "@/engine/achievements";
import type { Achievement } from "@/engine/achievements";
import Icon, { type IconName } from "./Icon";

/**
 * The badges, wherever they are being shown.
 *
 * Laid out as medals rather than as a list: a grid of rings you can read at a
 * glance, each with a bar showing how far along the next rung is, and a detail
 * view behind a tap. Two places want them — the stats page and the table — so
 * they live here rather than in either.
 */

/**
 * A face for each badge.
 *
 * Kept here rather than in the engine, which is about what counts as an
 * achievement, not what it looks like. An id with no glyph still renders; it
 * just gets the generic one.
 */
const GLYPH: Record<string, IconName> = {
  "first-win": "trophy",
  dominoed: "tile",
  capicua: "swap",
  tranca: "lock",
  pie: "back",
  cabeza: "crown",
  carried: "buoy",
  "wire-to-wire": "flag",
  clean: "spark",
  sharp: "target",
  "in-step": "robot",
  "fourteen-tiles": "pair",
  runaway: "wind",
  "hat-trick": "flame",
  partnership: "hands",
};

const RUNG_AFTER = ["bronze", "silver", "gold", "platinum"];

/** How far along the current rung is, 0 to 1. */
function fraction(a: Achievement): number {
  if (!a.progress || a.progress.need === 0) return a.earnedAt ? 1 : 0;
  return Math.min(1, a.progress.have / a.progress.need);
}

/**
 * One medal: a ring you can read across a room.
 *
 * The ring is drawn twice — a full faint circle for the track, and an arc over
 * it for progress — which is the same trick the big one in the detail view
 * uses, at a size where only the colour and the glyph really register.
 */
function Medal({ a, size = 56 }: { a: Achievement; size?: number }) {
  const r = size / 2 - 4;
  const circumference = 2 * Math.PI * r;
  const filled = fraction(a) * circumference;
  const rung = a.tier?.key ?? (a.earnedAt ? "gold" : "none");

  return (
    <span className={`medal rung-${rung} ${a.earnedAt ? "won" : ""}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="medal-track" cx={size / 2} cy={size / 2} r={r} />
        {filled > 0 && (
          <circle
            className="medal-arc"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeDasharray={`${filled} ${circumference}`}
            // Start the arc at the top rather than at three o'clock.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <span className="medal-glyph">
        <Icon name={GLYPH[a.id] ?? "diamond"} size={Math.round(size * 0.42)} />
      </span>
    </span>
  );
}

/** The four rungs as a row, with the one you are standing on picked out. */
function Ladder({ a }: { a: Achievement }) {
  if (!a.tier || a.tier.levels < 2) return null;
  return (
    <div className="ladder">
      {RUNG_AFTER.map((key, i) => (
        <span
          key={key}
          className={`ladder-step rung-${key} ${i < a.tier!.level ? "on" : ""} ${
            i === a.tier!.level ? "next" : ""
          }`}
          title={key}
        >
          <i aria-hidden><Icon name={GLYPH[a.id] ?? "diamond"} size={14} /></i>
        </span>
      ))}
    </div>
  );
}

/**
 * One badge, opened.
 *
 * Deliberately not a second overlay: this already gets shown inside the menu's
 * dialog on the table, and an overlay within an overlay is how the menu ended
 * up underneath the tiles the first time. It replaces the grid in place.
 */
function Detail({ a, onBack }: { a: Achievement; onBack: () => void }) {
  const size = 200;
  const r = size / 2 - 14;
  const circumference = 2 * Math.PI * r;
  const filled = fraction(a) * circumference;
  const rung = a.tier?.key ?? (a.earnedAt ? "gold" : "none");
  const top = a.tier?.top ?? false;

  return (
    <div className={`badge-detail rung-${rung}`}>
      <button className="badge-back" onClick={onBack}>
        ← All badges
      </button>

      <h4>{a.name}</h4>
      <p className="badge-detail-note">{a.note}</p>

      <div className="badge-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle className="medal-track big" cx={size / 2} cy={size / 2} r={r} />
          {filled > 0 && (
            <circle
              className="medal-arc big"
              cx={size / 2}
              cy={size / 2}
              r={r}
              strokeDasharray={`${filled} ${circumference}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}
        </svg>
        <span className="badge-ring-inner">
          <span className="badge-ring-glyph"><Icon name={GLYPH[a.id] ?? "diamond"} size={36} /></span>
          {a.progress ? (
            <>
              <b>{a.tier ? a.tier.times : a.progress.have}</b>
              <i>/{a.progress.need}</i>
            </>
          ) : (
            <b className="badge-ring-mark">{a.earnedAt ? "✓" : "—"}</b>
          )}
        </span>
      </div>

      <Ladder a={a} />

      <p className="badge-detail-status">
        {!a.earnedAt
          ? "Not yet."
          : top
            ? `${a.tier!.label} — nothing above this one.`
            : a.tier
              ? `${a.tier.label} — ${a.progress!.need - a.tier.times} more for ${
                  RUNG_AFTER[a.tier.level]
                }.`
              : `Earned ${a.earnedAt.slice(0, 10)}.`}
      </p>
    </div>
  );
}

export default function AchievementList({
  list,
  /** The stats page frames them itself; the table overlay does not. */
  heading = true,
}: {
  list: Achievement[];
  heading?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const earned = list.filter((a) => a.earnedAt);
  const next = nextUp(list);
  const open = list.find((a) => a.id === openId) ?? null;

  if (open) {
    return (
      <section className="stats-block">
        <Detail a={open} onBack={() => setOpenId(null)} />
      </section>
    );
  }

  return (
    <section className="stats-block">
      {heading && (
        <h3>
          Achievements{" "}
          <span className="stats-figure">
            {earned.length}/{list.length}
          </span>
        </h3>
      )}

      {next && (
        <p className="stats-next">
          Next up: <strong>{next.name}</strong> — {next.note}
          {next.progress && next.progress.have > 0 && (
            <span className="stats-progress">
              {" "}
              ({next.progress.have} of {next.progress.need})
            </span>
          )}
        </p>
      )}

      <ul className="medal-grid">
        {list.map((a) => (
          <li key={a.id}>
            <button
              className="medal-cell"
              onClick={() => setOpenId(a.id)}
              title={a.note}
              aria-label={`${a.name}. ${a.note}`}
            >
              <Medal a={a} />
              <span className="medal-name">{a.name}</span>
              {/* The thin bar under each, reading toward the next rung. */}
              <span className={`medal-bar rung-${a.tier?.key ?? "none"}`}>
                <i style={{ width: `${Math.round(fraction(a) * 100)}%` }} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="stats-note">
        Against people only — the computer does not count. Tap a badge for what
        it takes. Most run bronze, silver, gold, then platinum, which is a long
        way further than gold.
      </p>
    </section>
  );
}
