# Feedback loop

Players can report problems from inside the game, and every report carries the
position it refers to — so a complaint can be replayed rather than guessed at.

## For players

- **Feedback** button, bottom-right of any game screen. Sends a note plus the
  current position, hands, score, screen size and browser.
- **"This verdict looks wrong"** on every card in the round review. This is the
  valuable one: it sends the exact hand, the table, the verdict given and the
  reasoning behind it.

## Reading it

Two ways.

**In the app** — visit `/feedback` on the deployed site and enter the access key.
Newest first, filterable to unresolved, with a **Show position** button that
prints the full payload, and **Mark done** so the list stays meaningful.

Set the key once in Vercel → Settings → Environment Variables:

```
FEEDBACK_KEY = something-long-and-random
```

Without it the endpoint stays shut, so nobody can read the list by guessing the
URL. It is not a login — it is a shared secret, which is proportionate for a
private game. Don't reuse a password you use elsewhere.

**In Supabase** — Table Editor → `feedback`. Same data, no setup, handy for
sorting and bulk edits.

## Setting up the table

Run `supabase/003_feedback.sql` in the Supabase SQL editor, the same way as the
earlier migrations. Row level security is on with no policies, so browsers
cannot read or write it directly; everything goes through the server.

## Turning a report into a fix

The `position` in a review report is a complete `MoveRecord`: the hands, the
table, the open ends, and who had passed on what. That is exactly the shape the
tests in `src/engine/review.test.ts` use, so a bad verdict becomes a failing
test by pasting it in:

```ts
it("does not call this a mistake", () => {
  const history: MoveRecord[] = [ /* paste the position here */ ];
  expect(reviewRound(history, 0).moves[0].verdict).not.toBe("mistake");
});
```

Fix the rule until it passes, and the bug cannot come back.

## What is stored

Message, optional good/mixed/bad rating, nickname, room code, mode, the position
payload, screen size, user agent, and the deployed commit. No email addresses,
no accounts — there aren't any yet.
