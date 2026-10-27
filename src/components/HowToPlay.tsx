"use client";

import { useRef } from "react";
import { useModal } from "./useModal";
import Icon from "./Icon";

/**
 * The rules of partner dominoes as this table plays them, then how to move
 * the tiles. Rules first: someone new to the game needs those before the
 * controls mean anything.
 */
export default function HowToPlay({ onClose }: { onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useModal(boxRef, onClose);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog how-to-play"
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-play-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="app-menu-head">
          <h2 id="how-to-play-title">How to play</h2>
          <button className="app-menu-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>

        <section>
          <h3>The game</h3>
          <ul>
            <li>
              Four players in two teams. You and your partner sit across from each other, against
              East and West.
            </li>
            <li>First team to 100 points wins the match.</li>
            <li>
              Each round uses all 28 tiles of a double-six set: everyone gets 7, and there is
              nothing left to draw.
            </li>
          </ul>
        </section>

        <section>
          <h3>A round</h3>
          <ul>
            <li>
              The first round opens with the double six, played by whoever holds it. After that,
              the winner of the last round opens with any tile.
            </li>
            <li>
              Play goes to the right, counter-clockwise. On your turn, put down a tile that
              matches one of the two open ends.
            </li>
            <li>If you have nothing that fits, you pass. The game does it for you.</li>
          </ul>
        </section>

        <section>
          <h3>Scoring</h3>
          <ul>
            <li>
              <strong>Domino:</strong> the first player to play their last tile wins the round.
              Their team scores the pips left in the other team&apos;s hands.
            </li>
            <li>
              <strong>Blocked (tranca):</strong> if nobody can play, the team with fewer pips left
              between them wins, and scores the other team&apos;s pips. A dead tie scores
              nothing.
            </li>
            <li>
              <strong>Capicúa:</strong> going out on a tile that fits both ends. Bragging rights;
              it scores no extra here.
            </li>
          </ul>
        </section>

        <section>
          <h3>Playing as a team</h3>
          <ul>
            <li>
              You win or lose with your partner. Help them stay in the round, and make the other
              side pass.
            </li>
            <li>
              After each round, Review your play goes through your moves and what a strong partner
              would have done.
            </li>
          </ul>
        </section>

        <section>
          <h3>Moving the tiles</h3>
          <ul>
            <li>Tap a tile to flip it. Double-tap it, or press Enter, to play it.</li>
            <li>If a tile fits both ends, both light up: tap the one you want.</li>
            <li>You can also drag a tile onto an end, or within your hand to sort it.</li>
            <li>Hold any tile to see it up close.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
