"use client";

import { useEffect, useState } from "react";
import type { End, GameState, Seat, TileId } from "@/engine/types";
import type { PlayerView } from "@/server/types";
import Board from "./Board";
import AppMenu from "./AppMenu";
import CapicuaMoment from "./CapicuaMoment";
import TauntPrompt from "./TauntPrompt";
import { closingPlay } from "@/engine/engine";
import type { EndAnchors } from "./Board";
import DominoTile from "./DominoTile";
import FeedbackButton from "./FeedbackButton";
import type { FeedbackContext } from "./FeedbackForm";
import PlayableHand from "./PlayableHand";
import ReviewPanel from "./ReviewPanel";
import TableChat from "./TableChat";
import { useFading, useReplay } from "./useReplay";

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
  onReady,
  onChat,
  onLobby,
  fromStart,
  busy,
  error,
}: {
  view: PlayerView;
  /** We watched this match begin, rather than opening the page onto it. */
  fromStart: boolean;
  onMove: (tileId: TileId, end: End, taunt?: string) => void;
  onPass: () => void;
  onReady: (ready: boolean) => void;
  onChat: (text: string) => void;
  /** Take the whole table back to the lobby for another match. */
  onLobby: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [reviewing, setReviewing] = useState(false);
  /**
   * The review reads the finished round's history, which the server clears when
   * the next one is dealt. Hold a copy so what you are reading cannot vanish.
   */
  const [reviewHistory, setReviewHistory] = useState<GameState["history"]>([]);
  // Open by default — half the point of table talk is seeing it arrive.
  const [chatOpen, setChatOpen] = useState(true);
  const [ends, setEnds] = useState<EndAnchors>({ left: null, right: null });

  const game = view.game!;
  const you = view.you!.seat;
  const around = relativeSeats(you);
  const seat = (s: Seat) => view.seats[s];

  // Other players' moves arrive in batches; reveal them one at a time.
  const replay = useReplay(game.line, game.lastAction, {
    round: game.roundNumber,
    fromStart,
  });
  const myTurn =
    game.currentSeat === you && !game.roundOver && !game.matchOver && !replay.catchingUp;

  // Being stuck is not a decision — take the turn automatically and say so.
  useEffect(() => {
    if (!myTurn || !game.mustPass || busy) return;
    const t = setTimeout(onPass, 1400);
    return () => clearTimeout(t);
  }, [myTurn, game.mustPass, busy, onPass]);

  // Your team is the one you sit on: seats 0 & 2 against 1 & 3.
  const yourTeam = you % 2;
  const usScore = game.matchScore[yourTeam];
  const themScore = game.matchScore[1 - yourTeam];

  const whoseTurn = seat(game.currentSeat);
  const turnName = whoseTurn.isYou
    ? "Your turn"
    : `${whoseTurn.label}'s turn`;

  // Announce each tile as it lands, so you can follow a batch of moves that
  // arrived together.
  const openReview = () => {
    setReviewHistory(game.history);
    setReviewing(true);
  };

  // Only people actually at the table hold the round up: empty seats are
  // computers, and someone who has dropped is covered by one.
  const atTable = view.seats.filter((s) => s.nickname && s.connected);
  const youAreReady = view.seats[you].ready;
  const waitingFor = atTable
    .filter((s) => !s.ready && !s.isYou)
    .map((s) => s.nickname as string);
  const readyCount = atTable.filter((s) => s.ready).length;
  const humansAtTable = atTable.length;

  const feedbackContext = (): FeedbackContext => ({
    kind: "general",
    mode: "online",
    roomCode: view.code,
    about: `Round ${game.roundNumber}, ${view.seats[you].nickname ?? "you"} in seat ${you}`,
    payload: {
      line: game.line,
      ends: [game.leftEnd, game.rightEnd],
      hand: game.hand,
      currentSeat: game.currentSeat,
      matchScore: game.matchScore,
      seats: view.seats,
    },
  });

  /**
   * A capicúa gets its own moment before the scoreboard appears.
   *
   * Held until the replay has caught up, so the tile that did it is on the
   * table before we make a fuss about it.
   */
  const [capicuaSeen, setCapicuaSeen] = useState(false);
  useEffect(() => setCapicuaSeen(false), [game.roundNumber]);

  /**
   * A move held back so its player can say something first.
   *
   * Only ever a capicúa — the last tile, fitting both ends. Everything else
   * plays the instant it is dropped.
   */
  const [pending, setPending] = useState<{ tileId: TileId; end: End } | null>(null);

  const play = (tileId: TileId, end: End) => {
    const closesBothEnds =
      game.hand.length === 1 &&
      game.leftEnd !== null &&
      game.rightEnd !== null &&
      game.leftEnd !== game.rightEnd &&
      tileId.split("-").map(Number).sort().join("-") ===
        [game.leftEnd, game.rightEnd].sort((x, y) => x - y).join("-");

    if (closesBothEnds) setPending({ tileId, end });
    else onMove(tileId, end);
  };

  const closing = game.roundOver?.capicua ? closingPlay(game.history) : null;
  const showCapicua = Boolean(closing) && !capicuaSeen && !replay.catchingUp;

  const played = useFading(replay.justPlayed, 1500);
  const playedBanner = played
    ? `${seat(played.seat).isYou ? "You" : seat(played.seat).label} played ${Math.min(played.left, played.right)} | ${Math.max(played.left, played.right)}`
    : null;

  return (
    <main
      className={`table-root ${chatOpen ? "with-chat" : ""} ${showCapicua ? "shaken" : ""}`}
    >
      <header className="scoreboard">
        <div className="score us">
          <span className="label">Us</span>
          <span className="value">{usScore}</span>
        </div>
        <div className="score-meta">
          <AppMenu inGame={!game.matchOver} />
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
      {!error && playedBanner && <div className="banner played-banner">{playedBanner}</div>}
      {!error && !playedBanner && !myTurn && !game.roundOver && (
        <div className="banner">{turnName}</div>
      )}

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
              : `${seat(game.opener).label} opens${
                  game.mustOpenWithDoubleSix ? " with the double six" : ""
                }`}
          </div>
        ) : (
          <Board
            line={replay.line}
            lastAction={replay.lastAction}
            onEnds={setEnds}
            viewer={you}
          />
        )}
      </div>

      <div className="hand-area">
        {myTurn && !game.mustPass && (
          <div className="turn-hint">Your turn — drag a tile onto an end</div>
        )}
        {myTurn && game.mustPass && (
          <div className="skipped-note">Nothing you can play — skipping your turn</div>
        )}
        <PlayableHand
          tiles={game.hand}
          legalMoves={game.legalMoves}
          ends={ends}
          yourTurn={myTurn}
          disabled={busy}
          onPlay={play}
        />
      </div>

      {pending && (
        <TauntPrompt
          onCancel={() => setPending(null)}
          onPlay={(taunt) => {
            onMove(pending.tileId, pending.end, taunt);
            setPending(null);
          }}
        />
      )}

      {showCapicua && closing && (
        <CapicuaMoment
          tileId={closing.tileId}
          who={seat(closing.seat).isYou ? "You" : seat(closing.seat).label}
          ends={closing.ends}
          taunt={game.roundOver?.taunt}
          onDone={() => setCapicuaSeen(true)}
        />
      )}

      {game.roundOver && !reviewing && !replay.catchingUp && !showCapicua && (
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
                <button className="secondary" onClick={openReview}>
                  Review your play
                </button>

                {/* Same room, same seats, fresh match — the usual next thing
                    after a game ends with everyone still sitting there. */}
                {/* Back to the lobby they already know, with the seats still
                    theirs to rearrange. Nobody has to share a code again. */}
                <button disabled={busy} onClick={onLobby}>
                  Play again — back to the lobby
                </button>

                <a className="home-button secondary" href="/">
                  Home
                </a>
              </>
            ) : (
              <>
                <h2>
                  {game.roundOver.kind === "domino" &&
                    `${seat(game.roundOver.winnerSeat!).isYou ? "You" : seat(game.roundOver.winnerSeat!).label} dominoed!`}
                  {game.roundOver.kind === "blocked" && "Game blocked (tranca)"}
                  {game.roundOver.kind === "tie" && "Blocked — dead tie, no points"}
                </h2>
                {game.roundOver.winningTeam !== null && (
                  <p>
                    {game.roundOver.winningTeam === yourTeam ? "Your team" : "The other team"}{" "}
                    scores <strong>{game.roundOver.points}</strong> points
                  </p>
                )}
                <button className="secondary" onClick={openReview}>
                  Review your play
                </button>

                {/* Nobody's click starts the next round but everybody's. Take
                    as long as you like over the review. */}
                <button
                  className={youAreReady ? "secondary" : ""}
                  disabled={busy}
                  onClick={() => onReady(!youAreReady)}
                >
                  {youAreReady ? "Wait — not ready" : "Ready for next round"}
                </button>
                {waitingFor.length > 0 && (
                  <p className="ready-note">
                    {youAreReady
                      ? `Waiting for ${waitingFor.join(", ")}`
                      : `${readyCount} of ${humansAtTable} ready`}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {reviewing && (
        <ReviewPanel
          history={reviewHistory}
          seat={you}
          mode="online"
          roomCode={view.code}
          onClose={() => setReviewing(false)}
        />
      )}

      <TableChat
        chat={view.chat ?? []}
        you={you}
        onSend={onChat}
        open={chatOpen}
        onToggle={() => setChatOpen((o) => !o)}
        busy={busy}
        // Rides in the dock's toolbar — open or closed — so it never covers
        // Send, the table, or your hand.
        headerExtra={<FeedbackButton inline context={feedbackContext} />}
      />
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
        {info.label}
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
