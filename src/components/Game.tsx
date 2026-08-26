"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyMove,
  applyPass,
  closingPlay,
  isCapicua,
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
import FeedbackButton from "./FeedbackButton";
import PlayableHand from "./PlayableHand";
import ReviewPanel from "./ReviewPanel";
import Board from "./Board";
import type { EndAnchors } from "./Board";
import AppMenu from "./AppMenu";
import CapicuaMoment from "./CapicuaMoment";
import TauntPrompt, { MAX_TAUNT } from "./TauntPrompt";
import { reportSolo, reportSoloRound } from "@/lib/auth";
import { statsFor } from "@/engine/roundStats";

const SEAT_NAMES: Record<Seat, string> = { 0: "You", 1: "East", 2: "Partner", 3: "West" };
/** Long enough to watch each computer play land and read who played what. */
const AI_DELAY_MS = 2500;
const HUMAN: Seat = 0;

export default function Game() {
  const [state, setState] = useState<GameState | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [ends, setEnds] = useState<EndAnchors>({ left: null, right: null });
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [reviewing, setReviewing] = useState(false);
  /** The round whose capicúa has already had its moment. */
  const [capicuaRound, setCapicuaRound] = useState<number | null>(null);
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

  // Nothing playable is not a decision, so take the turn automatically and just
  // say so — clicking a button to confirm you are stuck is busywork.
  useEffect(() => {
    if (!state || state.roundOver || state.matchOver) return;
    if (state.currentSeat !== HUMAN || !mustPass(state, HUMAN)) return;
    const t = setTimeout(() => {
      setBanner("You had nothing to play — turn skipped");
      setState((s) => (s && mustPass(s, HUMAN) ? applyPass(s, HUMAN) : s));
    }, 1400);
    return () => clearTimeout(t);
  }, [state]);

  /**
   * Report a finished solo match, once.
   *
   * Solo runs entirely here, so this browser is the only thing that knows the
   * match ended. Guests report nothing and never notice the difference.
   */
  const reported = useRef(false);
  useEffect(() => {
    if (!state?.matchOver || reported.current) return;
    reported.current = true;
    const us = state.matchScore[0];
    const them = state.matchScore[1];
    reportSolo({ teamScore: us, opponentScore: them, rounds: state.roundNumber });
  }, [state?.matchOver, state?.matchScore, state?.roundNumber]);

  // Keep the finished round's history available for review.
  useEffect(() => {
    if (state?.roundOver) setLastRound(state.history);
  }, [state?.roundOver, state?.history]);

  /**
   * Report each finished solo round, once.
   *
   * The stats are worked out here because solo runs here — the server never
   * sees these games. That is also why they are stored and shown separately.
   */
  const reportedRound = useRef<number | null>(null);
  useEffect(() => {
    if (!state?.roundOver || reportedRound.current === state.roundNumber) return;
    reportedRound.current = state.roundNumber;
    const stat = statsFor(state, HUMAN);
    if (stat) reportSoloRound(stat);
  }, [state?.roundOver, state?.roundNumber, state]);

  // Auto-clear pass banner.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1600);
    return () => clearTimeout(t);
  }, [banner]);


  const playHuman = useCallback((tileId: TileId, end: End, taunt?: string) => {
    setState((s) => {
      if (!s) return s;
      const move = legalMoves(s, HUMAN).find(
        (m) => m.tileId === tileId && m.end === end
      );
      if (!move) return s;
      const next = applyMove(s, HUMAN, move);
      const line = (taunt ?? "").trim().slice(0, MAX_TAUNT);
      if (line && next.roundOver?.capicua) next.roundOver.taunt = line;
      return next;
    });
  }, []);

  /** Held back so a capicúa can be announced before it lands. */
  const [pending, setPending] = useState<{ tileId: TileId; end: End } | null>(null);

  const offerPlay = useCallback(
    (tileId: TileId, end: End) => {
      if (!state) return;
      const closesBothEnds =
        state.hands[HUMAN].length === 1 &&
        state.leftEnd !== null &&
        state.rightEnd !== null &&
        state.leftEnd !== state.rightEnd &&
        isCapicua(state, { tileId, end });

      if (closesBothEnds) setPending({ tileId, end });
      else playHuman(tileId, end);
    },
    [state, playHuman]
  );

  if (!state) {
    return <main className="table-root loading">Setting up the table…</main>;
  }

  const humanTurn = state.currentSeat === HUMAN && !state.roundOver && !state.matchOver;
  const humanMustPass = humanTurn && mustPass(state, HUMAN);
  const winner = matchWinner(state);

  // A capicúa takes the table before the scoreboard does.
  const closing = state.roundOver?.capicua ? closingPlay(state.history) : null;
  const showCapicua = Boolean(closing) && capicuaRound !== state.roundNumber;

  return (
    <main className={`table-root ${showCapicua ? "shaken" : ""}`}>
      {/* Scoreboard */}
      <header className="scoreboard">
        <div className="score us">
          <span className="label">Us (You + Partner)</span>
          <span className="value">{state.matchScore[0]}</span>
        </div>
        <div className="score-meta">
          <AppMenu inGame={!state.matchOver} />
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
          <Board line={state.line} lastAction={state.lastAction} onEnds={setEnds} />
        )}
      </div>

      {/* Human hand */}
      <div className="hand-area">
        {humanTurn && !humanMustPass && (
          <div className="turn-hint">Your turn — drag a tile onto an end</div>
        )}
        {humanMustPass && (
          <div className="skipped-note">Nothing you can play — skipping your turn</div>
        )}
        <PlayableHand
          tiles={state.hands[HUMAN]}
          legalMoves={myMoves}
          ends={ends}
          yourTurn={humanTurn}
          onPlay={offerPlay}
        />
      </div>

      {pending && (
        <TauntPrompt
          onCancel={() => setPending(null)}
          onPlay={(taunt) => {
            playHuman(pending.tileId, pending.end, taunt);
            setPending(null);
          }}
        />
      )}

      {showCapicua && closing && (
        <CapicuaMoment
          tileId={closing.tileId}
          who={SEAT_NAMES[closing.seat]}
          ends={closing.ends}
          taunt={state.roundOver?.taunt}
          onDone={() => setCapicuaRound(state.roundNumber)}
        />
      )}

      {/* Round / match end */}
      {state.roundOver && !reviewing && !showCapicua && (
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
          mode="solo"
          onClose={() => setReviewing(false)}
        />
      )}

      <FeedbackButton
        context={() => ({
          kind: "general",
          mode: "solo",
          about: `Round ${state.roundNumber} against the computer (${difficulty})`,
          payload: {
            line: state.line,
            ends: [state.leftEnd, state.rightEnd],
            hand: state.hands[HUMAN],
            currentSeat: state.currentSeat,
            matchScore: state.matchScore,
            difficulty,
          },
        })}
      />
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
