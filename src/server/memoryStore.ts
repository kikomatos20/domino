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
      rooms.set(room.code, clone(room));
    },
    async create(room) {
      if (rooms.has(room.code)) throw new Error(`Room ${room.code} already exists`);
      rooms.set(room.code, clone(room));
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
