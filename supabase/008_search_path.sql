-- Pin search_path on every function (Supabase linter 0011).
-- Without it, a function resolves table names through whatever search_path the
-- caller has, so a same-named object in another schema could be picked up
-- instead of ours. The functions only touch public tables, so pin to public.
-- Safe to re-run.

alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.purge_stale_rooms() set search_path = public, pg_temp;
alter function public.save_room(text, text, boolean, text, integer, text, integer, jsonb, jsonb, jsonb, boolean, jsonb, smallint, jsonb, boolean)
  set search_path = public, pg_temp;
