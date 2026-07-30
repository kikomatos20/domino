-- Migration 002 — atomic room saves, and a version that works before the match.
--
-- Two problems this fixes:
--
-- 1. Saving used to be several separate requests: delete every player row, then
--    insert them again. Anything reading in between saw a room with no players,
--    which is why seats flickered and players were told they were not seated.
--    `save_room` does the whole thing in one transaction, so a reader sees
--    either the old room or the new one, never a half-written one.
--
-- 2. The room version lived on the games row, which does not exist until the
--    match starts — so in the lobby it was always 0 and clients could not tell
--    a stale reply from a fresh one. Version now lives on the room itself.

alter table rooms add column if not exists version integer not null default 0;

create or replace function save_room(
  p_code       text,
  p_status     text,
  p_fill       boolean,
  p_difficulty text,
  p_target     integer,
  p_host       text,
  p_version    integer,
  p_players    jsonb,
  p_state      jsonb
) returns void as $$
declare
  v_room uuid;
begin
  update rooms
     set status       = p_status,
         fill_with_ai = p_fill,
         difficulty   = p_difficulty,
         target       = p_target,
         host_token   = p_host,
         version      = p_version
   where code = p_code
  returning id into v_room;

  if v_room is null then
    raise exception 'no room with code %', p_code;
  end if;

  delete from players where room_id = v_room;

  insert into players (room_id, seat, nickname, token, connected, last_seen)
  select v_room,
         (p ->> 'seat')::smallint,
         p ->> 'nickname',
         p ->> 'token',
         coalesce((p ->> 'connected')::boolean, true),
         coalesce(to_timestamp((p ->> 'lastSeen')::bigint / 1000.0), now())
    from jsonb_array_elements(p_players) as p;

  if p_state is not null then
    insert into games (room_id, state, round, version)
    values (v_room, p_state, coalesce((p_state ->> 'roundNumber')::int, 1), p_version)
    on conflict (room_id) do update
      set state   = excluded.state,
          round   = excluded.round,
          version = excluded.version;
  end if;
end;
$$ language plpgsql;
