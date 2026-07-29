# Domino — Partner Dominoes

Double-six partner dominoes (4 players, 2 teams). You + an AI partner vs two AI opponents. Everyone draws 7 — the full 28-tile set, no boneyard. First team to 100 points wins.

## Rules implemented

- Round 1 opens with the double-six (whoever holds it). Later rounds: the previous round's winner opens with any tile.
- Play counter-clockwise; match a tile to either open end; pass if you can't play.
- Round ends by **domino** (someone plays their last tile) or **blocked** (all four pass).
- Domino: the winning team scores the pips left in the opponents' hands. Blocked: the team with fewer combined pips wins the opponents' total; a dead tie scores nothing.

## Table layout

The table is square (1:1). Tiles are drawn at a fixed size and never shrink — the
chain starts in the middle and, when an arm reaches the edge, it turns the corner
and runs along the border, coiling inward if it goes all the way around.

- **The opening tile is the spinner.** It lies flat toward whoever opened, so you
  can see who went out, and both arms leave it crosswise — one from each half,
  running in opposite directions. So if East opens 1|6, the answer to the 6 goes
  out one side and the answer to the 1 goes out the other.
- After that, doubles sit crosswise to the chain and everything else runs along it.
- Corners: a normal tile tucks into the corner square making an L; a crosswise
  double sits squarely beyond the end. Tiles always meet face to face.
- Pips are painted on the tile face, so they rotate with the tile.

A full 28-tile chain is 1372px of dominoes and needs a 580px square to coil
cleanly. Smaller screens lay it out at that size and scale the whole table down,
so tile size is still fixed for the entire round.

## The opponents

Three difficulty levels, selectable during play.

- **Easy** — plays for weight only, ignores the table.
- **Medium** — tracks suits and passes, plays sensible dominoes.
- **Hard** — reads the table properly: who is void in what (from passes), which
  tiles are still unseen, which doubles are outstanding. It evaluates the
  *position* each move creates — how mobile it leaves each seat — and squeezes
  the player who moves next while keeping its partner alive.

The AI opens using the classic Venezuelan school — the *regla de oro* of
El Tigre de Carayaca (Héctor Simosa Alarcón): lead the highest double that has
company, fall back to the highest bare double, and with no doubles lead a heavy
tile from your longest suit.

Measured over 600 mirrored matches (sides swapped so seat order cannot skew it):

| Matchup | Win rate |
| --- | --- |
| hard vs medium | 65.8% |
| hard vs easy | 81.3% |
| medium vs easy | 80.7% |
| hard vs hard | 50.7% (sanity check) |

## Round review

After every round you can open a review of your own play. This is a *team* game,
so the review is built on the partner doctrine of Héctor Simosa Alarcón,
"El Tigre de Carayaca" (*Ciencia y Arte en el Dominó*). Two independent lenses:

**Principles.** Judged against the classic partner ideas, with a separate
team-play score for how often your choices helped your side:

- **Your role this round** (*el papel de los jugadores*) — every seat is named
  relative to the opener and told what it is for. The *mano* plays for their own
  hand; the *segunda* blocks them; the *tercera* exists to keep their partner
  from passing; the *pie* tries to make the opener pass.
- **Protecting your partner** — never open a suit they have passed on, repeat
  their suit when you can, and as the *tercera*, follow the suit they opened.
- **Punishing the opponents** — leave suits they have failed on, and don't feed
  the suit the player on your right is developing.
- **The opening** — the *regla de oro*: the highest double with company; a bare
  double (*en pelo*) names your suit but leaves you void; with no doubles, a
  mixed lead tells your partner so (*salida mata-doble*).
- **The close (*la tranca*)** — scored by El Tigre's own arithmetic rather than
  hindsight. The *cifra-base* is 168 less the pips already on the table; halve
  it, and weigh it against your own points plus the heaviest tiles your partner
  could still hold (never counting suits they have passed on). Close only at or
  under that half. Closing and losing is called out directly: *"la tranca es una
  jugada que no se debe hacer para perderla."* A close you skipped that the count
  did not support is explicitly **not** treated as a mistake.
- **Doubles** — play them at the first chance, and only wage war on one when you
  know where it is and can truly hang it.
- **Your own hand** — don't throw *la minga* (your only tile of two suits) early,
  don't open a fresh suit you can't answer, and keep control of the ends.

**Engine analysis.** Separately, where your move ranked in the engine's own
search, what it would have played instead, and why.

Forced moves are never counted against you.

## Sources

- Héctor Simosa Alarcón ("El Tigre de Carayaca"), *Ciencia y Arte en el Dominó* —
  in particular the chapters on la tranca, cuadros, and hanging doubles.
- [El papel de los jugadores](https://sites.google.com/site/dominoarteociencia/anuncio/elpapeldelosjugadores)
- [28 consejos para jugar al dominó por parejas](https://sites.google.com/site/dominoarteociencia/anuncio/28consejosparajugaraldominoporparejas)
- [La salida en profundidad](https://sites.google.com/site/dominoarteociencia/anuncio/lasalida)

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # engine unit tests
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel           # log in with your account, accept defaults
```

Or push the repo to GitHub and import it at vercel.com/new.

## Project structure

- `src/engine/` — pure game logic (tiles, rules, scoring) + AI. No UI dependencies, so it can run server-side for online multiplayer in phase 2.
- `src/components/` — the game table UI.
- `src/app/` — Next.js app shell.

## Roadmap

- **Phase 1 (this):** play vs computer.
- **Phase 2:** accounts + live online play (rooms with invite codes).
- **Phase 3:** ratings, matchmaking, match history — plus other game modes.
