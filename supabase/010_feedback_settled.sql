-- 010 + 011 as applied in production on 2026-10-08
-- (migrations 010_feedback_settled_source and 011_feedback_trigger_proposed).
--
--   status    open | proposed | fixed | settled | duplicate | wontfix | not_actionable
--   source    app (in-game form) | in_person (logged by Kiko)
--   proposal  latest proposed fix from the scheduled review (branch + summary)
--
-- 'proposed' counts as still open: it keeps resolved = false and resolved_at null.
-- Safe to re-run.

alter table public.feedback drop constraint if exists feedback_status_check;
alter table public.feedback add constraint feedback_status_check
  check (status in ('open', 'proposed', 'fixed', 'settled', 'duplicate', 'wontfix', 'not_actionable'));
alter table public.feedback add column if not exists source text not null default 'app';
alter table public.feedback add column if not exists proposal text;
comment on column public.feedback.status is 'open: needs work · proposed: fix drafted, awaiting Kiko · fixed: shipped (fixed_in) · settled: Kiko chose not to act · duplicate/wontfix/not_actionable: closed';
comment on column public.feedback.source is 'app (in-game form) or in_person (logged by Kiko)';
comment on column public.feedback.proposal is 'Latest proposed fix from the scheduled feedback review (branch name + summary)';

create or replace function public.feedback_sync_status() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.resolved := new.status not in ('open', 'proposed');
  elsif tg_op = 'UPDATE' and new.resolved is distinct from old.resolved then
    new.status := case when new.resolved then 'fixed' else 'open' end;
  end if;
  if new.status in ('open', 'proposed') then
    new.resolved_at := null;
  elsif new.resolved_at is null then
    new.resolved_at := now();
  end if;
  return new;
end $$;
