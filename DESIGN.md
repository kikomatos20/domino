# Domino design

The rules every screen follows. The redesign plan and the direction canvas
live in the Domino Claude project. This file is what the code agrees to.

## Table looks

A look is a set of colour tokens. Players pick one under **Menu → Table look**.
It is saved in `localStorage` under `domino.look` and set as `data-theme` on
`<html>` before the first paint (`src/lib/look.ts`). Every colour in
`src/app/globals.css` reads a token; no rule hard-codes a colour of its own,
except identity hues (menu accents, achievement medals) and status chips that
carry their own background and text pair.

| Token | A · Night felt (default) | B · Daylight club | C · Bone and ink |
| --- | --- | --- | --- |
| `--page` | `#0f1f18` | `#f4f3ef` | `#f5f0e3` |
| `--felt` (the table square) | `#1d5a3c` | `#2c6a4c` | `#1c1c1a` |
| `--surface` | `#18302a` | `#e6e4dc` | `#e8e0cc` |
| `--ink` | `#f3eee2` | `#17201c` | `#111111` |
| `--muted` | `#a9b8b0` | `#59645e` | `#5b574e` |
| `--gold` (highlight, turn, primary action) | `#e3b24f` | `#8a6100` | `#c22f2f` |
| `--us` / `--them` | `#8fd8b0` / `#f3a28f` | `#1e5c40` / `#b3402e` | `#111111` / `#c22f2f` |
| `--paper` (dialogs) | `#1e3a31` | `#ffffff` | `#fffdf7` |

The full list is in the `:root` blocks at the top of `globals.css`. Text
tokens pass 4.5:1 against the surface they sit on, in every look.

**Adding a look** (for example an earned unlock): add one
`:root[data-theme="<id>"]` block with every token, add the id to `Look`,
`LOOKS`, `parseLook` and the boot script in `src/lib/look.ts`, and add its
swatch colours to `.look-option[data-look="<id>"]`. Looks are earned in play,
never sold.

**Overlays.** Light-on-dark overlays are written as
`color-mix(in srgb, var(--ink) N%, transparent)` and darkening as
`color-mix(in srgb, var(--shade) N%, transparent)`, so the same rule works in
light and dark looks.

## Type

- One face: **Figtree** (SIL Open Font License), checked in at
  `src/app/fonts/` and loaded with `next/font/local`. Nothing calls a font
  service at build time or in the browser.
- Target sizes: 13, 16, 20, 32 px. Nothing under 13 px once phases 1–3 land.
  Sentence case, no tracked capitals.
- Scores and counts use tabular figures.

## Space and shape

- 8 px grid, 16 px phone gutters.
- Touch targets at least 44 × 44 px.
- Flat surfaces: no gradients, glass or resting shadows. Shadows only on what
  floats (dialogs, the tile you hold).
- Icons are inline SVG (`src/components/Icon.tsx`) in the text colour, never
  emoji.

## The table (unchanged rules, see README "Table layout")

Square 1:1 table, fixed tile size, spinner opening, corner turns, scale-down
on small screens. Layout changes must keep `lineLayout.ts` and its tests as
they are.

## Motion

Transform and opacity only. Every animation has a `prefers-reduced-motion`
fallback.

## Checking a change

- `npm test`, `npx tsc --noEmit`, `next build`.
- Screenshots at 390 × 844, 844 × 390 and 1440 × 900, in all three looks.
- Contrast of the text tokens against their surfaces, per look.
