-- Domino multiplayer schema.
--
-- Design notes
--
-- * The Next.js server is the only writer. It uses the service-role key, so
--   every rule in the game is enforced in one place and a client cannot forge a
--   move. Browsers never talk to these tables directly.
-- * Hidden information is kept out of reach by construction: the full game
--   state (including all four hands) lives in `games.state`, which no browser
--   can read. Clients call the API for a redacted view containing only their
--   own tiles.
-- * `players.user_id` is null while people play under a nickname. When logins
--   arrive it points at auth.users, and ratings/history hang off that — no
--   rewrite needed.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- rooms

create table if not exists rooms (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,             -- 6 characters, shared with friends
  status       text not null default 'lobby',    -- lobby | playing | finished
  fill_with_ai boolean not null default true,    -- empty seats played by the computer
  difficulty   text not null default 'medium',   -- easy | medium | hard (AI seats)
  target       integer not null default 100,
  host_token   text not null,                    -- who may change settings and start
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists rooms_code_idx on rooms (code);
create index if not exists rooms_activity_idx on rooms (updated_at);

-- ---------------------------------------------------------------- players

create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms (id) on delete cascade,
  seat       smallint not null check (seat between 0 and 3),
  nickname   text not null,
  -- Secret held by one browser; identifies the player without a login.
  token      text not null,
  -- Set once real accounts exist, so stats can follow a person across rooms.
  user_id    uuid,
  connected  boolean not null default true,
  last_seen  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (room_id, seat),
  unique (room_id, token)
);

create index if not exists players_room_idx on players (room_id);

-- ---------------------------------------------------------------- games

create table if not exists games (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms (id) on delete cascade,
  -- Full authoritative GameState, hands included. Server-only.
  state      jsonb not null,
  round      integer not null default 1,
  -- Bumped on every applied action; clients use it to spot stale views.
  version    integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (room_id)
);

-- ------------------------------------------------------- row level security
--
-- Everything is denied to browsers. The service-role key used by the API
-- bypasses RLS, so the server keeps working while clients get nothing — which
-- is exactly what we want for a game with hidden hands.

alter table rooms   enable row level security;
alter table players enable row level security;
alter table games   enable row level security;

-- ---------------------------------------------------------------- upkeep

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists rooms_touch on rooms;
create trigger rooms_touch before update on rooms
  for each row execute function touch_updated_at();

drop trigger if exists games_touch on games;
create trigger games_touch before update on games
  for each row execute function touch_updated_at();

-- Abandoned rooms are not worth keeping; call this from a scheduled job later.
create or replace function purge_stale_rooms() returns void as $$
  delete from rooms where updated_at < now() - interval '12 hours';
$$ language sql;
