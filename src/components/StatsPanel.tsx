"use client";

import type { RoundTotals, Stats, Tally } from "@/lib/auth";

/**
 * What you have to show for it.
 *
 * Online and solo are shown side by side rather than added together. They are
 * different opponents, and — less obviously — different levels of trust: an
 * online result is written by the server that ran the game, a solo one is
 * reported by the browser that played it.
 */
export default function StatsPanel({ stats }: { stats: Stats }) {
  const nothingYet = stats.online.played === 0 && stats.solo.played === 0;
  if (nothingYet) {
    return (
      <p className="home-sub">
        Nothing yet. Finish a match to a hundred and it lands here.
      </p>
    );
  }

  return (
    <div className="stats">
      <div className="stats-columns">
        <TallyBlock title="Against people" tally={stats.online} rounds={stats.onlineRounds} />
        <TallyBlock title="Against the computer" tally={stats.solo} rounds={stats.soloRounds} solo />
      </div>

      {stats.partners.length > 0 && (
        <section className="stats-block">
          <h3>Partners</h3>
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
        </section>
      )}

      <Trend rounds={stats.onlineRounds} solo={stats.soloRounds} />
    </div>
  );
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
  if (tally.played === 0 && rounds.rounds === 0) {
    return (
      <section className="stats-block">
        <h3>{title}</h3>
        <p className="stats-empty">Nothing yet.</p>
      </section>
    );
  }

  return (
    <section className="stats-block">
      <h3>{title}</h3>

      <div className="record-tally">
        <span className="record-win">{tally.won} W</span>
        <span className="record-loss">{tally.lost} L</span>
        {tally.played > 0 && (
          <span className="record-rate">
            {Math.round((tally.won / tally.played) * 100)}%
          </span>
        )}
      </div>

      <ul className="stats-list">
        {tally.streak > 1 && (
          <li>
            <span>On a streak</span>
            <span className="stats-figure">{tally.streak}</span>
          </li>
        )}
        {tally.bestStreak > 1 && (
          <li>
            <span>Best streak</span>
            <span className="stats-figure">{tally.bestStreak}</span>
          </li>
        )}
        {tally.played > 0 && (
          <li>
            <span>Average margin</span>
            <span className="stats-figure">
              {tally.margin > 0 ? "+" : ""}
              {tally.margin}
            </span>
          </li>
        )}

        {rounds.rounds > 0 && (
          <>
            <li>
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
            {(rounds.closedWon > 0 || rounds.closedLost > 0) && (
              <li>
                <span>Trancas won / lost</span>
                <span className="stats-figure">
                  {rounds.closedWon} / {rounds.closedLost}
                </span>
              </li>
            )}
            <li>
              <span>Times passed</span>
              <span className="stats-figure">{rounds.passes}</span>
            </li>
            {rounds.pipsWhenLosing !== null && (
              <li>
                <span>Pips left when losing</span>
                <span className="stats-figure">{rounds.pipsWhenLosing}</span>
              </li>
            )}
            {rounds.accuracy !== null && (
              <li>
                <span>Accuracy</span>
                <span className="stats-figure">{rounds.accuracy}%</span>
              </li>
            )}
            {rounds.engineAgreement !== null && (
              <li>
                <span>Matched the engine</span>
                <span className="stats-figure">{rounds.engineAgreement}%</span>
              </li>
            )}
            {rounds.teamPlay !== null && (
              <li>
                <span>Team play</span>
                <span className="stats-figure">{rounds.teamPlay}%</span>
              </li>
            )}
          </>
        )}
      </ul>

      {solo && rounds.rounds > 0 && (
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

  if (days.length < 2) return null;

  return (
    <section className="stats-block">
      <h3>Accuracy, last {days.length} days</h3>
      <div className="trend">
        {days.map((d) => (
          <div key={d.day} className="trend-bar" title={`${d.day}: ${d.accuracy}%`}>
            <div className="trend-fill" style={{ height: `${d.accuracy}%` }} />
            <span className="trend-label">{d.day.slice(8)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
