import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RoundOverlay from "./RoundOverlay";

// Feedback 41c4cb47 (in person): the round-over buttons cover the tiles left in
// everyone's hands, so there was no way to look at them.
describe("the round-over dialog", () => {
  it("keeps its own content and offers a way to look at the table", () => {
    const html = renderToStaticMarkup(
      createElement(RoundOverlay, null, createElement("h2", null, "West dominoed!"))
    );
    expect(html).toContain("West dominoed!");
    expect(html).toContain("See everyone&#x27;s tiles");
  });
});

describe("the round-over linger", () => {
  it("shows nothing at first when asked to wait, so the board is seen first", () => {
    const html = renderToStaticMarkup(
      createElement(RoundOverlay, { delayMs: 4000, children: createElement("h2", null, "West dominoed!") })
    );
    expect(html).toBe("");
  });
});
