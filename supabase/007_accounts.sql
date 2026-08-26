-- Migration 007 — accounts, and something to keep.
--
-- A username and a password, no email anywhere. Supabase auth is built around
-- email addresses, so each username is stored against a synthetic address on a
-- reserved domain that can never receive anything, and accounts are created
-- server-side already confirmed. Nothing is ever sent.
--
-- Both tables have row level security on with no policies at all, which denies
-- every browser. Only the server, holding the secret key, can read or write
-- them — the same rule the rest of the schema follows.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

-- Usernames are one per person regardless of case: "Kiko" and "kiko" collide.
create unique index if not exists profiles_username_key on profiles (lower(username));

alter table profiles enable row level security;

-- One row per finished match per signed-in player. Guests record nothing,
-- which is the point of the account.
create table if not exists match_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  room_code text,
  won boolean not null,
  team_score integer not null,
  opponent_score integer not null,
  rounds integer not null,
  partner_name text,
  finished_at timestamptz not null default now()
);

create index if not exists match_results_user_idx on match_results (user_id, finished_at desc);

alter table match_results enable row level security;

-- A seat can now belong to an account. Null means a guest, which stays the
-- normal case: nickname-only play is not going anywhere.
alter table players add column if not exists user_id uuid references auth.users (id) on delete set null;
