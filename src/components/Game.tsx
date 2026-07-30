"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyMove,
  applyPass,
  legalMoves,
  matchWinner,
  mustPass,
  newMatch,
  nextRound,
  parseTile,
  tilePips,
} from "@/engine/engine";
import { chooseMove } from "@/engine/ai";
import type { Difficulty } from "@/engine/ai";
import type { End, GameState, LastAction, PlacedTile, Seat, TileId } from "@/engine/types";
import DominoTile from "./DominoTile";
import ReviewPanel from "./ReviewPanel";
import Board from "./Board";

const SEAT_NAMES: Record<Seat, string> = { 0: "You", 1: "East", 2: "Partner", 3: "West" };
const AI_DELAY_MS = 1800;
const HUMAN: Seat = 0;

export default function Game() {
  const [state, setState] = useState<GameState | null>(null);
  const [pendingTile, setPendingTile] = useState<TileId | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [reviewing, setReviewing] = useState(false);
  /** History of the round just finished, kept so review survives the next deal. */
  const [lastRound, setLastRound] = useState<GameState["history"]>([]);

  // Create the match client-side to avoid SSR/client random mismatch.
  useEffect(() => {
    setState(newMatch());
  }, []);

  const myMoves = useMemo(
    () => (state ? legalMoves(state, HUMAN) : []),
    [state]
  );
  const playableTiles = useMemo(() => new Set(myMoves.map((m) => m.tileId)), [myMoves]);

  // AI turns.
  useEffect(() => {
    if (!state || state.roundOver || state.matchOver) return;
    if (state.currentSeat === HUMAN) return;
    const seat = state.currentSeat;
    const t = setTimeout(() => {
      setState((s) => {
        if (!s || s.currentSeat !== seat || s.roundOver || s.matchOver) return s;
        const move = chooseMove(s, seat, { difficulty });
        if (move) {
          setBanner(`${SEAT_NAMES[seat]} played ${move.tileId.replace("-", " | ")}`);
          return applyMove(s, seat, move);
        }
        setBanner(`${SEAT_NAMES[seat]} passed`);
        return applyPass(s, seat);
      });
    }, AI_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, difficulty]);

  // Keep the finished round's history available for review.
  useEffect(() => {
    if (state?.roundOver) setLastRound(state.history);
  }, [state?.roundOver, state?.history]);

  // Auto-clear pass banner.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1600);
    return () => clearTimeout(t);
  }, [banner]);


  const playHuman = useCallback(
    (tileId: TileId, end?: End) => {
      setState((s) => {
        if (!s) return s;
        const options = legalMoves(s, HUMAN).filter((m) => m.tileId === tileId);
        if (options.length === 0) return s;
        if (options.length > 1 && !end) {
          setPendingTile(tileId);
          return s;
        }
        const move = end ? options.find((m) => m.end === end)! : options[0];
        setPendingTile(null);
        return applyMove(s, HUMAN, move);
      });
    },
    []
  );

  if (!state) {
    return <main className="table-root loading">Setting up the table…</main>;
  }

  const humanTurn = state.currentSeat === HUMAN && !state.roundOver && !state.matchOver;
  const humanMustPass = humanTurn && mustPass(state, HUMAN);
  const winner = matchWinner(state);

  return (
    <main className="table-root">
      {/* Scoreboard */}
      <header className="scoreboard">
        <div className="score us">
          <span className="label">Us (You + Partner)</span>
          <span className="value">{state.matchScore[0]}</span>
        </div>
        <div className="score-meta">
          <span>Round {state.roundNumber}</span>
          <span>First to {state.target}</span>
          <select
            className="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            aria-label="Opponent difficulty"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="score them">
          <span className="label">Them (East + West)</span>
          <span className="value">{state.matchScore[1]}</span>
        </div>
      </header>

      {banner && <div className="banner">{banner}</div>}

      {/* Opponents / partner */}
      <div className="seat seat-north">
        <SeatInfo seat={2} state={state} />
      </div>
      <div className="seat seat-west">
        <SeatInfo seat={3} state={state} vertical />
      </div>
      <div className="seat seat-east">
        <SeatInfo seat={1} state={state} vertical />
      </div>

      {/* The line */}
      <div className="board">
        {state.line.length === 0 ? (
          <div className="board-empty">
            {state.mustOpenWithDoubleSix
              ? `${SEAT_NAMES[state.opener]} open${state.opener === HUMAN ? "" : "s"} with the double six`
              : `${SEAT_NAMES[state.opener]} open${state.opener === HUMAN ? "" : "s"} this round`}
          </div>
        ) : (
          <Board line={state.line} lastAction={state.lastAction} />
        )}
      </div>

      {/* Human hand */}
      <div className="hand-area">
        {humanTurn && !humanMustPass && <div className="turn-hint">Your turn</div>}
        {humanMustPass && (
          <button
            className="pass-button"
            onClick={() => {
              setBanner("You passed");
              setState((s) => (s && mustPass(s, HUMAN) ? applyPass(s, HUMAN) : s));
            }}
          >
            No playable tiles — Pass
          </button>
        )}
        <div className="hand">
          {state.hands[HUMAN].map((id) => {
            const { a, b } = parseTile(id);
            const playable = humanTurn && playableTiles.has(id);
            return (
              <DominoTile
                key={id}
                left={a}
                right={b}
                vertical
                highlight={playable}
                dimmed={humanTurn && !playable}
                onClick={playable ? () => playHuman(id) : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* End chooser */}
      {pendingTile && (
        <div className="overlay" onClick={() => setPendingTile(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p>Play {pendingTile.replace("-", "|")} on which end?</p>
            <div className="dialog-buttons">
              <button onClick={() => playHuman(pendingTile, "left")}>
                Left ({state.leftEnd})
              </button>
              <button onClick={() => playHuman(pendingTile, "right")}>
                Right ({state.rightEnd})
              </button>
            </div>
            <button className="link" onClick={() => setPendingTile(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Round / match end */}
      {state.roundOver && !reviewing && (
        <div className="overlay">
          <div className="dialog">
            {state.matchOver ? (
              <>
                <h2>{winner === 0 ? "Your team wins the match! 🏆" : "East & West win the match"}</h2>
                <p className="final">
                  {state.matchScore[0]} — {state.matchScore[1]}
                </p>
                <button className="secondary" onClick={() => setReviewing(true)}>
                  Review your play
                </button>
                <button onClick={() => setState(newMatch())}>New match</button>
              </>
            ) : (
              <>
                <h2>
                  {state.roundOver.kind === "domino" &&
                    `${SEAT_NAMES[state.roundOver.winnerSeat!]} dominoed!`}
                  {state.roundOver.kind === "blocked" && "Game blocked (tranca)"}
                  {state.roundOver.kind === "tie" && "Blocked — dead tie, no points"}
                </h2>
                {state.roundOver.winningTeam !== null && (
                  <p>
                    {state.roundOver.winningTeam === 0 ? "Your team" : "East & West"} score{" "}
                    <strong>{state.roundOver.points}</strong> points
                  </p>
                )}
                <p className="pips-detail">
                  Pips left — You: {state.roundOver.pips[0]}, East: {state.roundOver.pips[1]},
                  Partner: {state.roundOver.pips[2]}, West: {state.roundOver.pips[3]}
                </p>
                <button className="secondary" onClick={() => setReviewing(true)}>
                  Review your play
                </button>
                <button onClick={() => setState((s) => (s ? nextRound(s) : s))}>
                  Next round
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {reviewing && (
        <ReviewPanel
          history={lastRound}
          seat={HUMAN}
          onClose={() => setReviewing(false)}
        />
      )}
    </main>
  );
}



function SeatInfo({
  seat,
  state,
  vertical = false,
}: {
  seat: Seat;
  state: GameState;
  vertical?: boolean;
}) {
  const active = state.currentSeat === seat && !state.roundOver && !state.matchOver;
  const hand = state.hands[seat];
  // Once the round is over the tiles are no longer secret — turn them over so
  // you can see what everyone was left holding, and what it cost.
  const reveal = state.roundOver !== null;
  const pips = hand.reduce((sum, id) => sum + tilePips(id), 0);

  return (
    <div className={`seat-info ${active ? "active" : ""}`}>
      <span className="seat-name">
        {SEAT_NAMES[seat]}
        {seat === 2 ? " (your partner)" : ""}
        {reveal && hand.length > 0 && <span className="left-pips"> · {pips}</span>}
      </span>
      <div className={`backs ${vertical ? "vertical" : ""}`}>
        {reveal
          ? hand.map((id) => {
              const { a, b } = parseTile(id);
              return <DominoTile key={id} left={a} right={b} small vertical={!vertical} />;
            })
          : hand.map((id) => (
              <DominoTile key={id} left={0} right={0} back small vertical={!vertical} />
            ))}
      </div>
    </div>
  );
}
