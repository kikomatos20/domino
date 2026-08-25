-- Migration 004 — table talk.
--
-- Chat and the run of play share one stream, stored on the room. It is capped
-- at the last 120 entries by the server, so the column stays small and there is
-- no separate table to join or clean up.

alter table rooms add column if not exists chat jsonb not null default '[]'::jsonb;

-- save_room gains the chat, still writing everything in one transaction.
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
