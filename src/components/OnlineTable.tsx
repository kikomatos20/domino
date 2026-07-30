"use client";

import { useMemo, useState } from "react";
import { parseTile } from "@/engine/engine";
import type { End, Seat, TileId } from "@/engine/types";
import type { PlayerView } from "@/server/types";
import Board from "./Board";
import DominoTile from "./DominoTile";
import ReviewPanel from "./ReviewPanel";
import { useReplay } from "./useReplay";

/** Seat labels rotate so you are always at the bottom of your own screen. */
function relativeSeats(you: Seat) {
  return {
    bottom: you,
    right: ((you + 1) % 4) as Seat,
    top: ((you + 2) % 4) as Seat,
    left: ((you + 3) % 4) as Seat,
  };
}

export default function OnlineTable({
  view,
  onMove,
  onPass,
  onNextRound,
  busy,
  error,
}: {
  view: PlayerView;
  onMove: (tileId: TileId, end: End) => void;
  onPass: () => void;
  onNextRound: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [pendingTile, setPendingTile] = useState<TileId | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const game = view.game!;
  const you = view.you!.seat;
  const around = relativeSeats(you);
  const seat = (s: Seat) => view.seats[s];

  const playable = useMemo(
    () => new Set(game.legalMoves.map((m) => m.tileId)),
    [game.legalMoves]
  );

  // Other players' moves arrive in batches; reveal them one at a time.
  const replay = useReplay(game.line, game.lastAction);
  const myTurn =
    game.currentSeat === you && !game.roundOver && !game.matchOver && !replay.catchingUp;

  const play = (tileId: TileId) => {
    const options = game.legalMoves.filter((m) => m.tileId === tileId);
    if (options.length === 0) return;
    if (options.length > 1) return setPendingTile(tileId);
    onMove(tileId, options[0].end);
  };

  // Your team is the one you sit on: seats 0 & 2 against 1 & 3.
  const yourTeam = you % 2;
  const usScore = game.matchScore[yourTeam];
  const themScore = game.matchScore[1 - yourTeam];

  const whoseTurn = seat(game.currentSeat);
  const turnName = whoseTurn.isYou
    ? "Your turn"
    : `${whoseTurn.nickname ?? "Computer"}'s turn`;

  return (
    <main className="table-root">
      <header className="scoreboard">
        <div className="score us">
          <span className="label">Us</span>
          <span className="value">{usScore}</span>
        </div>
        <div className="score-meta">
          <span>Round {game.roundNumber}</span>
          <span>First to {view.target}</span>
          <span className="room-code">{view.code}</span>
        </div>
        <div className="score them">
          <span className="label">Them</span>
          <span className="value">{themScore}</span>
        </div>
      </header>

      {error && <div className="banner error-banner">{error}</div>}
      {!error && !myTurn && !game.roundOver && <div className="banner">{turnName}</div>}

      <div className="seat seat-north">
        <OnlineSeat info={seat(around.top)} reveal={game.revealed?.[around.top]} partner />
      </div>
      <div className="seat seat-west">
        <OnlineSeat info={seat(around.left)} reveal={game.revealed?.[around.left]} vertical />
      </div>
      <div className="seat seat-east">
        <OnlineSeat info={seat(around.right)} reveal={game.revealed?.[around.right]} vertical />
      </div>

      <div className="board">
        {replay.line.length === 0 ? (
          <div className="board-empty">
            {seat(game.opener).isYou
              ? game.mustOpenWithDoubleSix
                ? "You open with the double six"
                : "You open this round"
              : `${seat(game.opener).nickname ?? "Computer"} opens${
                  game.mustOpenWithDoubleSix ? " with the double six" : ""
                }`}
          </div>
        ) : (
          <Board line={replay.line} lastAction={replay.lastAction} />
        )}
      </div>

      <div className="hand-area">
        {myTurn && !game.mustPass && <div className="turn-hint">Your turn</div>}
        {myTurn && game.mustPass && (
          <button className="pass-button" disabled={busy} onClick={onPass}>
            No playable tiles — Pass
          </button>
        )}
        <div className="hand">
          {game.hand.map((id) => {
            const { a, b } = parseTile(id);
            const canPlay = myTurn && playable.has(id) && !busy;
            return (
              <DominoTile
                key={id}
                left={a}
                right={b}
                vertical
                highlight={canPlay}
                dimmed={myTurn && !playable.has(id)}
                onClick={canPlay ? () => play(id) : undefined}
              />
            );
          })}
        </div>
      </div>

      {pendingTile && (
        <div className="overlay" onClick={() => setPendingTile(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p>Play {pendingTile.replace("-", "|")} on which end?</p>
            <div className="dialog-buttons">
              <button
                onClick={() => {
                  onMove(pendingTile, "left");
                  setPendingTile(null);
                }}
              >
                Left ({game.leftEnd})
              </button>
              <button
                onClick={() => {
                  onMove(pendingTile, "right");
                  setPendingTile(null);
                }}
              >
                Right ({game.rightEnd})
              </button>
            </div>
            <button className="link" onClick={() => setPendingTile(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {game.roundOver && !reviewing && !replay.catchingUp && (
        <div className="overlay">
          <div className="dialog">
            {game.matchOver ? (
              <>
                <h2>
                  {game.roundOver.winningTeam === yourTeam
                    ? "Your team wins the match! 🏆"
                    : "The other team wins the match"}
                </h2>
                <p className="final">
                  {usScore} — {themScore}
                </p>
                <button className="secondary" onClick={() => setReviewing(true)}>
                  Review your play
                </button>
                <a className="home-button" href="/online">
                  Back to lobby
                </a>
              </>
            ) : (
              <>
                <h2>
                  {game.roundOver.kind === "domino" &&
                    `${seat(game.roundOver.winnerSeat!).isYou ? "You" : seat(game.roundOver.winnerSeat!).nickname ?? "Computer"} dominoed!`}
                  {game.roundOver.kind === "blocked" && "Game blocked (tranca)"}
                  {game.roundOver.kind === "tie" && "Blocked — dead tie, no points"}
                </h2>
                {game.roundOver.winningTeam !== null && (
                  <p>
                    {game.roundOver.winningTeam === yourTeam ? "Your team" : "The other team"}{" "}
                    scores <strong>{game.roundOver.points}</strong> points
                  </p>
                )}
                <button className="secondary" onClick={() => setReviewing(true)}>
                  Review your play
                </button>
                <button disabled={busy} onClick={onNextRound}>
                  Next round
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {reviewing && (
        <ReviewPanel history={game.history} seat={you} onClose={() => setReviewing(false)} />
      )}
    </main>
  );
}

function OnlineSeat({
  info,
  reveal,
  vertical = false,
  partner = false,
}: {
  info: PlayerView["seats"][number];
  /** Their leftover tiles, once the round has finished. */
  reveal?: string[];
  vertical?: boolean;
  partner?: boolean;
}) {
  const pips = reveal?.reduce((sum, id) => {
    const [a, b] = id.split("-").map(Number);
    return sum + a + b;
  }, 0);

  return (
    <div className="seat-info">
      <span className="seat-name">
        {info.nickname ?? "Computer"}
        {partner ? " (partner)" : ""}
        {info.nickname && !info.connected ? " · away" : ""}
        {reveal !== undefined && reveal.length > 0 && (
          <span className="left-pips"> · {pips}</span>
        )}
      </span>
      <div className={`backs ${vertical ? "vertical" : ""}`}>
        {reveal
          ? reveal.map((id) => {
              const [a, b] = id.split("-").map(Number);
              return (
                <DominoTile key={id} left={a} right={b} small vertical={!vertical} />
              );
            })
          : Array.from({ length: info.tilesLeft }, (_, i) => (
              <DominoTile key={i} left={0} right={0} back small vertical={!vertical} />
            ))}
      </div>
    </div>
  );
}
