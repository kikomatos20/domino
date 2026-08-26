/**
 * How often to re-read the room when nothing has told us to.
 *
 * Polling is the fallback, not the delivery mechanism. When the websocket is
 * up, a change arrives the moment it happens and the timer exists only to catch
 * a broadcast we missed. When the socket is down, the timer *is* the game, so
 * it has to run hard.
 *
 * The other half of the saving is idleness. Sitting in a lobby or reading the
 * round review used to cost a request every 1.5 seconds and deliver nothing.
 */

/** No change seen for this long and the table counts as idle. */
export const IDLE_AFTER_MS = 20_000;

export const POLL = {
  /** Websocket up: just a safety net. */
  liveActive: 12_000,
  liveIdle: 40_000,
  /** No websocket: the timer is the only way anything arrives. */
  deadActive: 1_500,
  deadIdle: 5_000,
} as const;

export interface PollInputs {
  /** The realtime channel is subscribed and believed to be working. */
  live: boolean;
  /** Milliseconds since the room last changed under us. */
  sinceChange: number;
  /** The round is over or the match is finished — nobody is waiting on a tile. */
  resting?: boolean;
}

export function pollDelay({ live, sinceChange, resting = false }: PollInputs): number {
  const idle = resting || sinceChange >= IDLE_AFTER_MS;
  if (live) return idle ? POLL.liveIdle : POLL.liveActive;
  return idle ? POLL.deadIdle : POLL.deadActive;
}

/**
 * Roughly how many requests an hour of four-handed play costs, used to sanity
 * check that a change to the numbers above actually saves anything.
 */
export function requestsPerTableHour(delayMs: number, heartbeatMs: number): number {
  const perPlayer = 3_600_000 / delayMs + 3_600_000 / heartbeatMs;
  return Math.round(perPlayer * 4);
}
