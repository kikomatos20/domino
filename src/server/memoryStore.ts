import type { Room, RoomStore } from "./types";

/**
 * In-memory rooms. Used by the tests, and as a fallback in local development
 * when Supabase credentials are not configured, so the app still runs.
 *
 * Not suitable for production: serverless instances do not share memory.
 */
export function createMemoryStore(): RoomStore & { clear(): void } {
  const rooms = new Map<string, Room>();
  const clone = (room: Room): Room => structuredClone(room);

  return {
    async get(code) {
      const room = rooms.get(code);
      return room ? clone(room) : null;
    },
    async put(room) {
      rooms.set(
        room.code,
        clone({
          ...room,
          chat: room.chat ?? [],
          players: room.players.map((p) => ({ ...p, wantsSeat: p.wantsSeat ?? null })),
        })
      );
    },
    async create(room) {
      if (rooms.has(room.code)) throw new Error(`Room ${room.code} already exists`);
      rooms.set(room.code, clone(room));
    },
    async setReady(code, token, ready) {
      const player = rooms.get(code)?.players.find((p) => p.token === token);
      if (player) player.ready = ready;
    },
    async touchPlayer(code, token) {
      const room = rooms.get(code);
      const player = room?.players.find((p) => p.token === token);
      if (player) {
        player.connected = true;
        player.lastSeen = Date.now();
      }
    },
    clear() {
      rooms.clear();
    },
  };
}

/** One shared instance, so route handlers in the same process agree. */
declare global {
  // eslint-disable-next-line no-var
  var __dominoMemoryStore: (RoomStore & { clear(): void }) | undefined;
}

export function sharedMemoryStore() {
  globalThis.__dominoMemoryStore ??= createMemoryStore();
  return globalThis.__dominoMemoryStore;
}
