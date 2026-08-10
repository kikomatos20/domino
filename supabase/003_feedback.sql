-- Migration 003 — in-app feedback.
--
-- The point is not the message on its own, it is the message *plus the exact
-- position it refers to*. "The review was wrong about my 4" is hard to act on;
-- the same words attached to the hands, the table and the verdict that was
-- given can be turned straight into a failing test.

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  -- general | review | bug
  kind        text not null default 'general',
  message     text not null,
  -- Rough sentiment, when the person picks one: -1 bad, 0 neutral, 1 good.
  rating      smallint,
  nickname    text,
  room_code   text,
  -- solo | online
  mode        text,
  -- Everything needed to reproduce: the position, the verdict complained
  -- about, screen size, user agent.
  context     jsonb,
  app_version text,
  -- Set once you have dealt with it, so the list stays useful.
  resolved    boolean not null default false
);

create index if not exists feedback_created_idx on feedback (created_at desc);
create index if not exists feedback_open_idx on feedback (resolved, created_at desc);

-- Browsers cannot read or write this directly; everything goes through the
-- server, same as the game tables.
alter table feedback enable row level security;
