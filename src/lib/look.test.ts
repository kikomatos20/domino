import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, LOOKS, LOOK_BOOT_SCRIPT, parseLook } from "./look";

describe("table looks", () => {
  it("accepts the three looks", () => {
    expect(parseLook("a")).toBe("a");
    expect(parseLook("b")).toBe("b");
    expect(parseLook("c")).toBe("c");
  });

  it("falls back to Night felt for anything else", () => {
    for (const bad of [null, undefined, "", "d", "A", 1, {}]) {
      expect(parseLook(bad)).toBe(DEFAULT_LOOK);
    }
    expect(DEFAULT_LOOK).toBe("a");
  });

  it("lists every look once, default first", () => {
    expect(LOOKS.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("boot script sets only known looks", () => {
    const html = { dataset: {} as Record<string, string> };
    const run = (stored: string | null) => {
      html.dataset = {};
      new Function("localStorage", "document", LOOK_BOOT_SCRIPT)(
        { getItem: () => stored },
        { documentElement: html }
      );
      return html.dataset.theme;
    };
    expect(run("b")).toBe("b");
    expect(run("c")).toBe("c");
    expect(run("zzz")).toBeUndefined();
    expect(run(null)).toBeUndefined();
  });
});
