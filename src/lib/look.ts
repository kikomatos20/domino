/**
 * Table looks: the colour sets a player can pick in the menu.
 *
 * A look is only a value of data-theme on <html>; every colour in
 * globals.css reads its tokens. A (Night felt) is the default. More looks
 * can be added later as earned unlocks: one token block in globals.css and
 * one entry here.
 */

export type Look = "a" | "b" | "c";

export const LOOKS: { id: Look; name: string; note: string }[] = [
  { id: "a", name: "Night felt", note: "Dark room, lit table" },
  { id: "b", name: "Daylight club", note: "Light, best outdoors" },
  { id: "c", name: "Bone and ink", note: "Ivory and charcoal" },
];

export const DEFAULT_LOOK: Look = "a";
export const LOOK_KEY = "domino.look";

/** Anything stored that is not a known look falls back to the default. */
export function parseLook(value: unknown): Look {
  return value === "a" || value === "b" || value === "c" ? value : DEFAULT_LOOK;
}

export function readLook(): Look {
  try {
    return parseLook(localStorage.getItem(LOOK_KEY));
  } catch {
    return DEFAULT_LOOK;
  }
}

export function applyLook(look: Look): void {
  document.documentElement.dataset.theme = look;
  try {
    localStorage.setItem(LOOK_KEY, look);
  } catch {
    // Private mode or blocked storage: the look still applies for this visit.
  }
}

/**
 * Runs in <head> before the first paint, so a saved look never flashes the
 * default first. Kept tiny and self-contained: it is inlined as a string.
 */
export const LOOK_BOOT_SCRIPT = `try{var l=localStorage.getItem(${JSON.stringify(
  LOOK_KEY
)});if(l==="b"||l==="c")document.documentElement.dataset.theme=l}catch(e){}`;
