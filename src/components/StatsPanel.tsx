"use client";

import { nextUp } from "@/engine/achievements";
import type { Achievement } from "@/engine/achievements";
import type { RoundTotals, Stats, Tally } from "@/lib/auth";

/**
 * What you have to show for it.
 *
 * Online and solo are shown side by side rather than added together. They are
 * different opponents, and — less obviously — different levels of trust: an
 * online result is written by the server that ran the game, a solo one is
 * reported by the browser that played it.
 *
 * Everything is shown from the start, zeros included. A page that hides its own
 * shape until you have earned something tells you nothing about what is being
 * tracked, or what is worth going after.
 */
export default function StatsPanel({ stats }: { stats: Stats }) {
  const anything =
    stats.online.played > 0 ||
    stats.solo.played > 0 ||
    stats.onlineRounds.rounds > 0 ||
    stats.soloRounds.rounds > 0;

  return (
    <div className="stats">
      {!anything && (
        <p className="stats-hint">
          Nothing recorded yet — this fills in as you play. Rounds count
          straight away; matches when someone reaches a hundred.
        </p>
      )}

      <div className="stats-columns">
        <TallyBlock title="Against people" tally={stats.online} rounds={stats.onlineRounds} />
        <TallyBlock
          title="Against the computer"
          tally={stats.solo}
          rounds={stats.soloRounds}
          solo
        />
      </div>

      <section className="stats-block">
        <h3>Partners</h3>
        {stats.partners.length === 0 ? (
          <p className="stats-empty">
            Nobody yet. Play with a friend rather than a computer and they show
            up here.
          </p>
        ) : (
          <ul className="stats-list">
            {stats.partners.map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <span className="stats-figure">
                  {p.won}–{p.played - p.won}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Achievements list={stats.achievements} />

      <Trend rounds={stats.onlineRounds} solo={stats.soloRounds} />
    </div>
  );
}

/**
 * Earned against people only.
 *
 * Shown whether earned or not, so you can see what there is to go after — and
 * the one nearest to hand is called out, because a wall of locked badges tells
 * you less than a single reachable target.
 */
function Achievements({ list }: { list: Achievement[] }) {
  const earned = list.filter((a) => a.earnedAt);
  const next = nextUp(list);

  return (
    <section className="stats-block">
      <h3>
        Achievements <span className="stats-figure">{earned.length}/{list.length}</span>
      </h3>

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
        {list.map((a) => (
          <li key={a.id} className={`badge ${a.earnedAt ? "won" : ""}`} title={a.note}>
            <span className="badge-name">{a.name}</span>
            <span className="badge-note">
              {a.earnedAt ? a.earnedAt.slice(0, 10) : a.note}
            </span>
          </li>
        ))}
      </ul>

      <p className="stats-note">Against people only — the computer does not count.</p>
    </section>
  );
}

/** A number, or a dash when there is genuinely nothing to average yet. */
function figure(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`;
}

function TallyBlock({
  title,
  tally,
  rounds,
  solo = false,
}: {
  title: string;
  tally: Tally;
  rounds: RoundTotals;
  solo?: boolean;
}) {
  return (
    <section className="stats-block">
      <h3>{title}</h3>

      <div className="record-tally">
        <span className="record-win">{tally.won} W</span>
        <span className="record-loss">{tally.lost} L</span>
        <span className="record-rate">
          {tally.played > 0 ? `${Math.round((tally.won / tally.played) * 100)}%` : "—"}
        </span>
      </div>

      <ul className="stats-list">
        <li>
          <span>Matches</span>
          <span className="stats-figure">{tally.played}</span>
        </li>
        <li>
          <span>Current streak</span>
          <span className="stats-figure">{tally.streak}</span>
        </li>
        <li>
          <span>Best streak</span>
          <span className="stats-figure">{tally.bestStreak}</span>
        </li>
        <li>
          <span>Average margin</span>
          <span className="stats-figure">
            {tally.played > 0 ? `${tally.margin > 0 ? "+" : ""}${tally.margin}` : "—"}
          </span>
        </li>

        <li className="stats-divider">
          <span>Rounds</span>
          <span className="stats-figure">{rounds.rounds}</span>
        </li>
        <li>
          <span>Dominoed</span>
          <span className="stats-figure">{rounds.dominoes}</span>
        </li>
        <li className={rounds.capicuas > 0 ? "shiny" : ""}>
          <span>Capicúas</span>
          <span className="stats-figure">{rounds.capicuas}</span>
        </li>
        <li>
          <span>Trancas won / lost</span>
          <span className="stats-figure">
            {rounds.closedWon} / {rounds.closedLost}
          </span>
        </li>
        <li>
          <span>Times passed</span>
          <span className="stats-figure">{rounds.passes}</span>
        </li>
        <li>
          <span>Pips left when losing</span>
          <span className="stats-figure">{figure(rounds.pipsWhenLosing)}</span>
        </li>
        <li>
          <span>Accuracy</span>
          <span className="stats-figure">{figure(rounds.accuracy, "%")}</span>
        </li>
        <li>
          <span>Matched the engine</span>
          <span className="stats-figure">{figure(rounds.engineAgreement, "%")}</span>
        </li>
        <li>
          <span>Team play</span>
          <span className="stats-figure">{figure(rounds.teamPlay, "%")}</span>
        </li>
      </ul>

      {solo && (
        <p className="stats-note">Reported by your own browser, so kept separate.</p>
      )}
    </section>
  );
}

/** Accuracy per day. A bar each, no library, no axes to misread. */
function Trend({ rounds, solo }: { rounds: RoundTotals; solo: RoundTotals }) {
  const days = [...rounds.trend, ...solo.trend]
    .reduce<{ day: string; accuracy: number; rounds: number }[]>((all, d) => {
      const found = all.find((x) => x.day === d.day);
      if (!found) return [...all, { ...d }];
      // Weighted, so a day with one round does not outweigh a day with ten.
      const total = found.rounds + d.rounds;
      found.accuracy = Math.round(
        (found.accuracy * found.rounds + d.accuracy * d.rounds) / total
      );
      found.rounds = total;
      return all;
    }, [])
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14);

  return (
    <section className="stats-block">
      <h3>Accuracy by day</h3>
      {days.length < 2 ? (
        <p className="stats-empty">
          {days.length === 0
            ? "Play a round and this starts filling in."
            : "One day so far — a second gives it something to compare against."}
        </p>
      ) : (
        <div className="trend">
          {days.map((d) => (
            <div key={d.day} className="trend-bar" title={`${d.day}: ${d.accuracy}%`}>
              <div className="trend-fill" style={{ height: `${d.accuracy}%` }} />
              <span className="trend-label">{d.day.slice(8)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
