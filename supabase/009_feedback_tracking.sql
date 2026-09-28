-- Track what happened to each report, not just whether it is done.
--
--   status      open | fixed | duplicate | wontfix | not_actionable
--   fixed_in    commit sha that shipped the fix (short form is fine)
--   resolution  one line: what changed, or why nothing will
--   resolved_at set automatically when a report leaves 'open'
--
-- `resolved` stays, and stays in step with `status`, so the /feedback page and
-- its "Mark done" button keep working unchanged: marking done sets 'fixed',
-- reopening sets 'open'; setting a status directly updates `resolved`.
-- Safe to re-run.

alter table public.feedback
  add column if not exists status text not null default 'open',
  add column if not exists fixed_in text,
  add column if not exists resolution text,
  add column if not exists resolved_at timestamptz;

do $$ begin
  alter table public.feedback add constraint feedback_status_check
    check (status in ('open', 'fixed', 'duplicate', 'wontfix', 'not_actionable'));
exception when duplicate_object then null; end $$;

create or replace function public.feedback_sync_status() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.resolved := new.status <> 'open';
  elsif tg_op = 'UPDATE' and new.resolved is distinct from old.resolved then
    new.status := case when new.resolved then 'fixed' else 'open' end;
  end if;
  if new.status = 'open' then
    new.resolved_at := null;
  elsif new.resolved_at is null then
    new.resolved_at := now();
  end if;
  return new;
end $$;

drop trigger if exists feedback_sync_status on public.feedback;
create trigger feedback_sync_status before insert or update on public.feedback
  for each row execute function public.feedback_sync_status();

create index if not exists feedback_open_idx on public.feedback (created_at desc) where status = 'open';
