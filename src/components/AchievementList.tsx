"use client";

import { nextUp } from "@/engine/achievements";
import type { Achievement } from "@/engine/achievements";

/**
 * The badges, wherever they are being shown.
 *
 * Lives on its own because there are now two places that want them: the stats
 * page, and the table — where you should be able to see what you are close to
 * without walking out of a game to find out.
 */

/** What you are climbing toward, named by the rung you are standing on. */
const RUNG_AFTER = ["bronze", "silver", "gold", "platinum"];

export default function AchievementList({
  list,
  /** The stats page frames them itself; the table overlay does not. */
  heading = true,
}: {
  list: Achievement[];
  heading?: boolean;
}) {
  const earned = list.filter((a) => a.earnedAt);
  const next = nextUp(list);

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

      <ul className="badges">
        {list.map((a) => {
          const tier = a.tier;
          return (
            <li
              key={a.id}
              // The rung names the colour: bronze, silver, gold, platinum.
              className={`badge ${a.earnedAt ? "won" : ""} rung-${tier?.key ?? "none"}`}
              title={a.note}
            >
              <span className="badge-name">
                {a.name}
                {/* Rungs as pips — four filled dots read faster than "4/4". */}
                {tier && tier.levels > 1 && (
                  <span
                    className="badge-rungs"
                    aria-label={`${tier.level} of ${tier.levels}`}
                  >
                    {Array.from({ length: tier.levels }, (_, i) => (
                      <i key={i} className={i < tier.level ? "on" : ""} />
                    ))}
                  </span>
                )}
              </span>
              <span className="badge-note">
                {!a.earnedAt
                  ? a.note
                  : !tier
                    ? a.earnedAt.slice(0, 10)
                    : tier.top
                      ? `${tier.label} · ${tier.times} times`
                      : `${tier.label} · ${tier.times} of ${a.progress?.need} for ${RUNG_AFTER[tier.level]}`}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="stats-note">
        Against people only — the computer does not count. Most of these run
        bronze, silver, gold, then platinum, which is a long way further than gold.
      </p>
    </section>
  );
}
