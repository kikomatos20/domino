# Turning on online play

> **If rooms vanish mid-game** ("No room with that code" after a few moves),
> this setup has not been done, or the keys have not reached the deployment.
> Visit `/api/health` on your site — it says exactly what is missing.


Everything is built and tested. It needs one thing from you: a free Supabase
project, so rooms live somewhere real instead of in a single server's memory.

Takes about five minutes.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign up (free tier is plenty).
2. **New project**. Name it anything — `domino` is fine.
3. Pick a region near you and set a database password (you won't need it again;
   save it anyway).
4. Wait for it to finish provisioning.

## 2. Create the tables

1. In the project, open **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/schema.sql` from this repo.
3. **Run**. You should see "Success".

That creates three tables (`rooms`, `players`, `games`) with row level security
switched on and no policies — meaning browsers can read nothing. Only our server,
using the service-role key, can touch them. That's what keeps players' tiles
hidden from each other.

## 3. Copy the three keys

In **Project Settings**:

- **Data API** → **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
- **API Keys** → **anon / public** → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **API Keys** → **service_role** → this is `SUPABASE_SERVICE_ROLE_KEY`

The service-role key bypasses all security. It must only ever live on the server:
never commit it, never paste it into client code. If it leaks, rotate it in the
same screen.

## 4. Tell Vercel

**Vercel → your project → Settings → Environment Variables.** Add all three, for
Production, Preview and Development. Then redeploy (or just push a commit).

## 5. And locally

Create `.env.local` in the project folder with the same three lines — see
`.env.example`. Restart `npm run dev`.

## Checking it worked

Open the deployed site on your phone, **Play with Friends**, create a table, and
open the room code on your laptop. If both devices see each other in the lobby,
it's working. If the laptop says "No room with that code", the environment
variables haven't reached the deployment.

## What runs without Supabase

The app still loads and the solo game is completely unaffected. Online rooms fall
back to in-memory storage, which is only good for a single browser against the
computer — rooms disappear on restart and separate serverless instances can't see
each other's rooms.
