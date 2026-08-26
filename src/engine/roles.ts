// Who holds the lead, and what each seat's job is because of it.
//
// Lives on its own because both sides need it: the review judges you against
// the duties of the role you held at the time, and the AI has to play by the
// same doctrine — otherwise we grade the human on a standard the computer
// opposite them never follows.

import type { MoveRecord, Seat } from "./types";

/** Seat roles, named relative to whoever holds the lead. */
export type Role = "mano" | "segunda" | "tercera" | "pie";

export function roleOf(seat: Seat, mano: Seat): Role {
  const offset = (seat - mano + 4) % 4;
  return offset === 0 ? "mano" : offset === 1 ? "segunda" : offset === 2 ? "tercera" : "pie";
}

/**
 * Who holds the lead right now.
 *
 * The mano is not fixed for the round. El Tigre is explicit that the roles move
 * as players pass — the lead belongs to whoever has the fewest tiles left, and
 * on equal counts to whoever plays first. So a mano who passes hands the lead
 * to the next player, and everyone's job changes with it.
 *
 * Tile *counts* are public: everyone can see how many tiles each player holds.
 * This is safe for the AI to use.
 */
export function manoAt(hands: readonly { length: number }[], opener: Seat): Seat {
  const counts = hands.map((h) => h.length);
  const fewest = Math.min(...counts);
  for (let i = 0; i < 4; i++) {
    const seat = ((opener + i) % 4) as Seat;
    if (counts[seat] === fewest) return seat;
  }
  return opener;
}

/** A moment in the round where the lead changed hands. */
export interface LeadShift {
  /** Index into the history where the new lead took effect. */
  at: number;
  from: Seat;
  to: Seat;
  /** What caused it — a pass is the interesting case. */
  cause: "pass" | "play";
  /** The seat whose action moved the lead. */
  by: Seat;
}

/**
 * Every time the lead moved during a round.
 *
 * A pass is the case worth reporting. Passing does not lighten your hand, so
 * the moment you pass someone else holds fewer tiles than you and the lead —
 * with all the duties attached to it — moves on without a tile being played.
 */
export function leadShifts(history: MoveRecord[], opener: Seat): LeadShift[] {
  const shifts: LeadShift[] = [];
  let current = opener;

  history.forEach((rec, index) => {
    // The hands as they stood before this action, then after it.
    const before = rec.before.hands;
    const after = before.map((h, i) =>
      i === rec.seat && rec.kind === "play" ? h.slice(0, -1) : h
    );

    const manoBefore = manoAt(before, opener);
    const manoAfter = manoAt(after, opener);
    if (manoBefore !== current) current = manoBefore;

    if (manoAfter !== current) {
      shifts.push({
        at: index,
        from: current,
        to: manoAfter,
        cause: rec.kind,
        by: rec.seat,
      });
      current = manoAfter;
    }
  });

  return shifts;
}
