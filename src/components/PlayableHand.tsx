"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseTile } from "@/engine/engine";
import type { End, Move, TileId } from "@/engine/types";
import DominoTile from "./DominoTile";
import ZoomedTile, { HOLD_MS } from "./ZoomedTile";
import type { EndAnchors } from "./Board";
import { resolveDrop, type Rect } from "./dropTarget";
import { flipTile, moveTile, reconcileOrder, slotAt } from "./handOrder";
import { isDoubleTap, tapIntent, tileLabel, type Tap } from "./tapPlay";
import {
  GHOST_LEAN,
  GHOST_SCALE,
  RETURN_OPACITY,
  RETURN_SCALE,
  rememberDrop,
  tiltFor,
  type GhostPose,
} from "./dragMotion";

/** Over the row of tiles itself, give or take a little slack above and below. */
function inHandRow(r: Rect, x: number, y: number): boolean {
  return x >= r.left - 20 && x <= r.right + 20 && y >= r.top - 24 && y <= r.bottom + 24;
}

/** How long tiles take to slide into a new place. */
const SLIDE_MS = 160;

/** Remembers that the how-to-play hint has been seen on this device. */
export const HINT_KEY = "domino.hint.tapPlay";

/** Movement before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 6;

interface Drag {
  tileId: TileId;
  x: number;
  y: number;
  /** Still might be a tap — no ghost until the finger actually moves. */
  moved: boolean;
  /** How far the held tile leans with the motion, in degrees. */
  tilt: number;
  /**
   * Your hand as it lay when the drag began: the row, and the other tiles in
   * order. Slots are worked out against this, so the tiles moving apart to
   * make room do not move the slot from under your finger.
   */
  home?: { row: Rect; others: Rect[] };
}

/**
 * Your tiles, playable by dragging onto either end of the chain.
 *
 * Dragging is the natural gesture for dominoes: pick a tile up, slide it to the
 * end you want; the ends it fits light up while you hold it. Tapping a tile
 * only turns it round, so you can read it whichever way up you like. Playing
 * is always a drag.
 *
 * Dropping a tile back among your own tiles puts it in that slot, so you can
 * arrange your hand however you like to read it — on your turn or not. While
 * you hold it over your hand the others slide apart to show where it will go,
 * and whatever you let go of glides to its place rather than jumping there.
 */
export default function PlayableHand({
  tiles,
  legalMoves,
  ends,
  yourTurn,
  disabled,
  onPlay,
}: {
  tiles: TileId[];
  legalMoves: Move[];
  ends: EndAnchors;
  yourTurn: boolean;
  disabled?: boolean;
  onPlay: (tileId: TileId, end: End) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [zoomed, setZoomed] = useState<TileId | null>(null);
  const [order, setOrder] = useState<TileId[]>(tiles);
  const shown = useMemo(() => reconcileOrder(order, tiles), [order, tiles]);
  /** Tiles you have turned round. Only how they look in your hand, like the order. */
  const [flipped, setFlipped] = useState<Set<TileId>>(() => new Set());
  /** The tile just flipped, so it can be seen turning. Bumped on every tap. */
  const [turning, setTurning] = useState<{ id: TileId; n: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Dropping back here means "never mind", so we need to know where it is. */
  const handRef = useRef<HTMLDivElement>(null);
  /** Set when a hold magnified the tile, so releasing does not also play it. */
  const held = useRef(false);
  /** Where each tile sat after the last render, to slide it from there. */
  const laidAt = useRef(new Map<TileId, { x: number; y: number }>());
  /** A tile let go of in the hand, and where: it glides home from that point. */
  const landing = useRef<{ tileId: TileId; pose: GhostPose } | null>(null);
  /** The ghost under your finger, measured as you let go of it. */
  const ghostRef = useRef<HTMLDivElement>(null);
  /** Straightens the held tile up when the finger stops moving. */
  const settleTilt = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The last tap, to tell a double-tap (play) from a tap (turn round). */
  const lastTap = useRef<Tap | null>(null);
  /** A tile that fits both ends, waiting for you to pick one. */
  const [choosing, setChoosing] = useState<TileId | null>(null);
  const endButtons = useRef<HTMLDivElement>(null);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);

  const movesFor = useCallback(
    (tileId: TileId) => legalMoves.filter((m) => m.tileId === tileId),
    [legalMoves]
  );
  const playable = useMemo(
    () => new Set(legalMoves.map((m) => m.tileId)),
    [legalMoves]
  );

  const canPlay = (id: TileId) => yourTurn && !disabled && playable.has(id);

  /** Play a tile without dragging it: straight on, or offer both ends. */
  const playByTap = (id: TileId) => {
    if (!canPlay(id)) return;
    const intent = tapIntent(legalMoves, id);
    if (intent.kind === "play") {
      setChoosing(null);
      onPlay(id, intent.end);
    } else if (intent.kind === "choose") {
      setChoosing(id);
    }
  };

  // Anything that changes what you can play drops a pending choice.
  useEffect(() => {
    if (choosing && !(yourTurn && !disabled && playable.has(choosing))) setChoosing(null);
  }, [choosing, yourTurn, disabled, playable]);

  // Tapping anywhere but an end or your hand puts the choice away.
  useEffect(() => {
    if (!choosing) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest(".end-choice, .hand")) setChoosing(null);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [choosing]);

  /** Shown once, the first time someone sits at a table on this device. */
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    try {
      setShowHint(!localStorage.getItem(HINT_KEY));
    } catch {
      setShowHint(false);
    }
  }, []);
  const dismissHint = () => {
    setShowHint(false);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // Storage blocked: it just shows again next visit.
    }
  };

  // Choosing an end from the keyboard: focus moves to the end buttons.
  useEffect(() => {
    if (choosing) endButtons.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [choosing]);

  // Only a tile on the move lights the ends: a press may still be a tap.
  const active = drag?.moved ? drag.tileId : null;
  const activeEnds = useMemo(
    () => new Set(active ? movesFor(active).map((m) => m.end) : []),
    [active, movesFor]
  );

  /** Which end the pointer is over, or null if letting go would cancel. */
  const endUnder = useCallback(
    (x: number, y: number): End | null => {
      const hand = handRef.current?.getBoundingClientRect();
      // Everything from the top of your hand down is yours: the hand itself and
      // whatever sits below it, such as the chat on a narrow screen.
      const handZone = hand
        ? {
            left: 0,
            right: window.innerWidth,
            top: hand.top,
            bottom: Number.POSITIVE_INFINITY,
          }
        : null;
      const dock = document
        .querySelector(".chat-dock")
        ?.getBoundingClientRect() as Rect | undefined;
      return resolveDrop(x, y, activeEnds, ends, [handZone, dock ?? null]);
    },
    [activeEnds, ends]
  );

  const hovered = drag && drag.moved ? endUnder(drag.x, drag.y) : null;
  // Back over your hand: show the tile is coming home rather than being played.
  const returning = Boolean(drag?.moved) && hovered === null;

  /**
   * How the ghost looks with the pointer at (x, y): held up and leaning, or,
   * when `back` (over your hand, or anywhere letting go would cancel), small,
   * faint and straight. Matches the .drag-ghost styles, which read these too.
   */
  const ghostPose = (d: Drag, x: number, y: number, back: boolean): GhostPose => {
    const h = (ghostRef.current?.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    const scale = back ? RETURN_SCALE : GHOST_SCALE;
    return {
      // The ghost hangs a little above the pointer: it is pulled up 60% of its
      // height, so its middle sits a tenth of its height above.
      x,
      y: y - h * 0.1,
      angle: back ? 0 : GHOST_LEAN + d.tilt,
      height: h * scale,
      top: face(d.tileId).a,
    };
  };

  /** The slot among your tiles under (x, y), or null if not over your hand. */
  const slotUnder = (d: Drag, x: number, y: number): number | null =>
    d.home && inHandRow(d.home.row, x, y) ? slotAt(x, y, d.home.others) : null;
  // Held over your hand: lay the tiles out as they would be if you let go now.
  const gap = drag?.moved ? slotUnder(drag, drag.x, drag.y) : null;
  const laidOut = drag && gap !== null ? moveTile(shown, drag.tileId, gap) : shown;

  // Any tile whose place changed slides there from where it was; a tile just
  // let go of glides from the drop point. Runs after every render, before paint.
  useLayoutEffect(() => {
    const row = handRef.current;
    if (!row) return;
    const land = landing.current;
    landing.current = null;
    const now = new Map<TileId, { x: number; y: number }>();
    Array.from(row.children).forEach((child, i) => {
      const el = child as HTMLElement;
      const id = laidOut[i];
      const at = { x: el.offsetLeft, y: el.offsetTop };
      now.set(id, at);
      if (!el.animate) return;
      if (land?.tileId === id) {
        // Start exactly as the ghost was, then settle into the tile's own look
        // (a single keyframe ends on whatever the tile's styles say).
        const r = el.getBoundingClientRect();
        const { pose } = land;
        const dx = pose.x - (r.left + r.right) / 2;
        const dy = pose.y - (r.top + r.bottom) / 2;
        el.getAnimations().forEach((a) => a.cancel());
        el.animate(
          [
            {
              translate: `${dx}px ${dy}px`,
              scale: `${el.offsetHeight ? pose.height / el.offsetHeight : 1}`,
              rotate: `${pose.angle}deg`,
              opacity: RETURN_OPACITY,
            },
          ],
          { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }
        );
        return;
      }
      const was = laidAt.current.get(id);
      if (was && (was.x !== at.x || was.y !== at.y)) {
        el.getAnimations().forEach((a) => a.cancel());
        el.animate(
          [{ translate: `${was.x - at.x}px ${was.y - at.y}px` }, { translate: "0px 0px" }],
          { duration: SLIDE_MS, easing: "ease-out" }
        );
      }
    });
    laidAt.current = now;
  });

  // Follow the pointer for the whole gesture, even outside the tile.
  useEffect(() => {
    if (!drag) return;

    const move = (e: PointerEvent) => {
      const moved =
        drag.moved ||
        (start.current
          ? Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) >
            DRAG_THRESHOLD
          : false);
      // Moving means you meant to drag, not to inspect.
      if (moved) {
        cancelHold();
        if (held.current) {
          held.current = false;
          setZoomed(null);
        }
      }
      // The first real movement: note how the hand lay before anything moves.
      let home = drag.home;
      if (moved && !home && handRef.current) {
        const row = handRef.current;
        home = {
          row: row.getBoundingClientRect(),
          others: Array.from(row.children)
            .filter((_, i) => shown[i] !== drag.tileId)
            .map((el) => el.getBoundingClientRect()),
        };
      }
      const tilt = moved ? tiltFor(drag.tilt, e.clientX - drag.x) : 0;
      if (settleTilt.current) clearTimeout(settleTilt.current);
      settleTilt.current = setTimeout(() => setDrag((d) => (d ? { ...d, tilt: 0 } : d)), 90);
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, moved, tilt, home } : d));
    };

    const up = (e: PointerEvent) => {
      cancelHold();
      if (settleTilt.current) clearTimeout(settleTilt.current);
      const dropped = drag.moved ? endUnder(e.clientX, e.clientY) : null;

      // A hold was for a closer look — let go without playing anything.
      if (held.current) {
        held.current = false;
        setZoomed(null);
        setDrag(null);
        start.current = null;
        return;
      }

      if (dropped) {
        rememberDrop(drag.tileId, ghostPose(drag, e.clientX, e.clientY, false));
        onPlay(drag.tileId, dropped);
      } else if (drag.moved) {
        // Let go over your own tiles: it goes in that slot. Anywhere else that
        // is not an end is still just "never mind". Either way it glides there.
        const slot = slotUnder(drag, e.clientX, e.clientY);
        if (slot !== null) setOrder(moveTile(shown, drag.tileId, slot));
        landing.current = { tileId: drag.tileId, pose: ghostPose(drag, e.clientX, e.clientY, true) };
      } else {
        const now = performance.now();
        if (isDoubleTap(lastTap.current, drag.tileId, now)) {
          // The first tap already turned it round: put it back, then play it.
          lastTap.current = null;
          setFlipped((f) => flipTile(f, drag.tileId));
          playByTap(drag.tileId);
        } else {
          // A single tap turns the tile round, straight away.
          lastTap.current = { tileId: drag.tileId, at: now };
          setChoosing(null);
          setFlipped((f) => flipTile(f, drag.tileId));
          setTurning((t) => ({ id: drag.tileId, n: (t?.n ?? 0) + 1 }));
        }
      }
      setDrag(null);
      start.current = null;
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, endUnder, onPlay, cancelHold, shown]);

  useEffect(
    () => () => {
      cancelHold();
      if (settleTilt.current) clearTimeout(settleTilt.current);
    },
    [cancelHold]
  );

  // Spin the tile you just tapped half a turn into its new way up. Its halves
  // have already swapped, so it starts from upside down and comes round.
  useLayoutEffect(() => {
    if (!turning) return;
    const el = handRef.current?.children[laidOut.indexOf(turning.id)] as HTMLElement | undefined;
    el?.animate?.([{ rotate: "180deg" }, { rotate: "0deg" }], {
      duration: 240,
      easing: "cubic-bezier(0.3, 0.9, 0.4, 1)",
    });
    // Only a new tap should start it again, not the hand re-rendering.
  }, [turning]);

  // Escape backs out of a tile you have picked up but not committed.
  useEffect(() => {
    if (!drag) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      cancelHold();
      if (drag?.moved) {
        const back = endUnder(drag.x, drag.y) === null;
        landing.current = { tileId: drag.tileId, pose: ghostPose(drag, drag.x, drag.y, back) };
      }
      held.current = false;
      start.current = null;
      setZoomed(null);
      setDrag(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [drag, cancelHold, endUnder]);

  /** The tile's two numbers, top first, the way up you have turned it. */
  const face = (id: TileId) => {
    const { a, b } = parseTile(id);
    return flipped.has(id) ? { a: b, b: a } : { a, b };
  };

  return (
    <>
      {showHint && (
        <div className="play-hint" role="note">
          <span>Tap a tile to flip it. Double-tap to play it.</span>
          <button onClick={dismissHint}>Got it</button>
        </div>
      )}
      <div ref={handRef} className={`hand ${disabled ? "sending" : ""}`}>
        {laidOut.map((id) => {
          const { a, b } = face(id);
          const usable = canPlay(id);
          const isActive = active === id;
          return (
            <DominoTile
              key={id}
              left={a}
              right={b}
              vertical
              highlight={usable}
              dimmed={yourTurn && !playable.has(id)}
              className={`${usable ? "grabbable" : ""} ${isActive || choosing === id ? "lifted" : ""} ${
                drag?.tileId === id && drag.moved ? "dragging" : ""
              }`}
              tabIndex={0}
              label={tileLabel(a, b, playable.has(id), yourTurn)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  playByTap(id);
                } else if (e.key === " " || e.key.toLowerCase() === "f") {
                  e.preventDefault();
                  setFlipped((f) => flipTile(f, id));
                  setTurning((t) => ({ id, n: (t?.n ?? 0) + 1 }));
                } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const next = (e.key === "ArrowLeft" ? el.previousElementSibling : el.nextElementSibling) as HTMLElement | null;
                  next?.focus();
                }
              }}
              onPointerDown={(e) => {
                // Hold any tile — playable or not — to read it properly.
                held.current = false;
                cancelHold();
                holdTimer.current = setTimeout(() => {
                  held.current = true;
                  setZoomed(id);
                }, HOLD_MS);

                // Every tile can be picked up to rearrange; only playable ones
                // can land on an end.
                start.current = { x: e.clientX, y: e.clientY };
                setDrag({ tileId: id, x: e.clientX, y: e.clientY, moved: false, tilt: 0 });
              }}
            />
          );
        })}
      </div>

      {/* Drop targets on the open ends the held tile can actually go on. */}
      {active &&
        (["left", "right"] as End[]).map((end) => {
          const anchor = ends[end];
          if (!anchor || !activeEnds.has(end)) return null;
          return (
            <div
              key={end}
              className={`drop-target ${hovered === end ? "over" : ""}`}
              style={{ left: anchor.x, top: anchor.y }}
              aria-hidden
            >
              <span className="drop-label">{end}</span>
            </div>
          );
        })}

      {/* A tile that fits both ends: the two ends to pick from. Real buttons,
          so a tap, a click or the keyboard all work. */}
      {choosing && (
        <div
          ref={endButtons}
          role="group"
          aria-label={`Play ${face(choosing).a}|${face(choosing).b} on which end?`}
          onKeyDown={(e) => {
            if (e.key === "Escape") setChoosing(null);
          }}
        >
          {(["left", "right"] as End[]).map((end) => {
            const anchor = ends[end];
            if (!anchor || !movesFor(choosing).some((m) => m.end === end)) return null;
            return (
              <button
                key={end}
                className="drop-target end-choice"
                style={{ left: anchor.x, top: anchor.y }}
                aria-label={`${end === "left" ? "Left" : "Right"} end`}
                onClick={() => {
                  const id = choosing;
                  setChoosing(null);
                  onPlay(id, end);
                }}
              >
                <span className="drop-label">{end}</span>
              </button>
            );
          })}
        </div>
      )}

      {zoomed && (
        <ZoomedTile
          tileId={zoomed}
          onClose={() => {
            held.current = false;
            setZoomed(null);
          }}
        />
      )}

      {/* The tile under your finger. */}
      {drag && drag.moved && (
        <div
          ref={ghostRef}
          className={`drag-ghost ${returning ? "returning" : ""}`}
          style={
            {
              left: drag.x,
              top: drag.y,
              "--lift": GHOST_SCALE,
              "--lean": `${GHOST_LEAN + drag.tilt}deg`,
              "--back-scale": RETURN_SCALE,
              "--back-opacity": RETURN_OPACITY,
            } as React.CSSProperties
          }
        >
          <DominoTile
            left={face(drag.tileId).a}
            right={face(drag.tileId).b}
            vertical
            highlight={!returning}
          />
        </div>
      )}
    </>
  );
}
