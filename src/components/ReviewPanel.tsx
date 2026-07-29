"use client";

import { useMemo, useState } from "react";
import { reviewRound } from "@/engine/review";
import type { MoveReview, Verdict } from "@/engine/review";
import type { MoveRecord, Seat } from "@/engine/types";

const VERDICT_LABEL: Record<Verdict, string> = {
  great: "Strong",
  good: "Sound",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
};

export default function ReviewPanel({
  history,
  seat,
  onClose,
}: {
  history: MoveRecord[];
  seat: Seat;
  onClose: () => void;
}) {
  const review = useMemo(() => reviewRound(history, seat), [history, seat]);
  const [lens, setLens] = useState<"principles" | "engine">("principles");

  return (
    <div className="overlay" onClick={onClose}>
      <div className="review" onClick={(e) => e.stopPropagation()}>
        <header className="review-head">
          <div>
            <h2>Your play this round</h2>
            <p className="review-summary">{review.summary}</p>
          </div>
          <button className="review-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="role-band">
          <span className="role-name">{review.roleTitle}</span>
          <span className="role-advice">{review.roleAdvice}</span>
        </div>

        <div className="lens-tabs">
          <button
            className={lens === "principles" ? "active" : ""}
            onClick={() => setLens("principles")}
          >
            Principles
            {review.teamPlay !== null && (
              <span className="tab-badge">team {review.teamPlay}%</span>
            )}
          </button>
          <button
            className={lens === "engine" ? "active" : ""}
            onClick={() => setLens("engine")}
          >
            Engine analysis
          </button>
        </div>

        <div className="review-body">
          {review.moves.length === 0 && (
            <p className="review-empty">You didn&apos;t place a tile this round.</p>
          )}
          {review.moves.map((m) => (
            <MoveCard key={m.number} m={m} lens={lens} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MoveCard({ m, lens }: { m: MoveReview; lens: "principles" | "engine" }) {
  return (
    <article className={`move-card ${m.verdict}`}>
      <div className="move-head">
        <span className="move-no">{m.number}</span>
        <span className="move-title">{m.headline}</span>
        <span className={`verdict ${m.verdict}`}>{VERDICT_LABEL[m.verdict]}</span>
      </div>

      <p className="move-context">
        {m.endsBefore
          ? `Ends were ${m.endsBefore[0]} and ${m.endsBefore[1]} · played on the ${m.end}`
          : "Opening tile"}
        {m.choices > 1 ? ` · ${m.choices} legal options` : " · forced"}
      </p>

      {lens === "principles" ? (
        <ul className="notes">
          {m.principles.map((n, i) => (
            <li key={i} className={n.kind}>
              {n.team && <span className="team-tag">team</span>}
              {n.text}
            </li>
          ))}
        </ul>
      ) : m.engine ? (
        <div className="engine-block">
          {m.engine.agrees ? (
            <p className="engine-verdict agree">
              Engine agrees — this was its first choice of {m.engine.total}.
            </p>
          ) : (
            <p className="engine-verdict differ">
              Engine ranked this {m.engine.rank} of {m.engine.total}. It would have
              played <strong>{m.engine.bestTileId.replace("-", "|")}</strong> on the{" "}
              {m.engine.bestEnd} end{m.engine.gap > 0 ? ` (+${m.engine.gap})` : ""}.
            </p>
          )}
          {m.engine.bestReasons.length > 0 && (
            <ul className="notes">
              {m.engine.bestReasons.map((r, i) => (
                <li key={i} className="info">
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="engine-verdict agree">Forced move — nothing to compare.</p>
      )}
    </article>
  );
}
