import type { ReactNode } from "react";

/**
 * The one bar across the top of the table: menu, both scores with how far
 * each side is towards the target, and the round. Everything else that used
 * to sit here (difficulty, room code) lives in the menu.
 */
export default function ScoreBar({
  us,
  them,
  usLabel = "Us",
  themLabel = "Them",
  target,
  round,
  menu,
}: {
  us: number;
  them: number;
  usLabel?: string;
  themLabel?: string;
  target: number;
  round: number;
  /** The menu button, with whatever this table adds to the menu. */
  menu: ReactNode;
}) {
  const share = (n: number) => `${Math.max(0, Math.min(100, (n / target) * 100))}%`;
  return (
    <header className="scoreboard">
      {menu}
      <div className="score us" aria-label={`${usLabel} ${us} of ${target}`}>
        <span className="score-line">
          <span className="label">{usLabel}</span>
          <span className="value">{us}</span>
        </span>
        <span className="score-track" aria-hidden>
          <span className="score-fill" style={{ width: share(us) }} />
        </span>
      </div>
      <div className="score-meta">
        <span>to {target}</span>
        <span>Round {round}</span>
      </div>
      <div className="score them" aria-label={`${themLabel} ${them} of ${target}`}>
        <span className="score-line">
          <span className="value">{them}</span>
          <span className="label">{themLabel}</span>
        </span>
        <span className="score-track" aria-hidden>
          <span className="score-fill" style={{ width: share(them) }} />
        </span>
      </div>
    </header>
  );
}
