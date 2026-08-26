-- Migration 006 — asking for someone's seat.
--
-- Taking a seat out from under another player changes who they are partnered
-- with, so it has to be asked for rather than done. One outstanding request per
-- player is enough, which makes this a single nullable column rather than a
-- table of its own: wants_seat is the seat you have asked its occupant for.

alter table players add column if not exists wants_seat smallint;

-- save_room carries the request through the atomic write.
create or replace function save_room(
  p_code       text,
  p_status     text,
  p_fill       boolean,
  p_difficulty text,
  p_target     integer,
  p_host       text,
  p_version    integer,
  p_players    jsonb,
  p_state      jsonb,
  p_chat       jsonb default '[]'::jsonb
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
         version      = p_version,
         chat         = coalesce(p_chat, '[]'::jsonb)
   where code = p_code
  returning id into v_room;

  if v_room is null then
    raise exception 'no room with code %', p_code;
  end if;

  delete from players where room_id = v_room;

  insert into players (room_id, seat, nickname, token, connected, last_seen, ready, wants_seat)
  select v_room,
         (p ->> 'seat')::smallint,
         p ->> 'nickname',
         p ->> 'token',
         coalesce((p ->> 'connected')::boolean, true),
         coalesce(to_timestamp((p ->> 'lastSeen')::bigint / 1000.0), now()),
         coalesce((p ->> 'ready')::boolean, false),
         nullif(p ->> 'wantsSeat', '')::smallint
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
