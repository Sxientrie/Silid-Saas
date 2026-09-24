-- Phase 02: keep privileged SECURITY DEFINER transitions in the non-exposed
-- app schema. Public wrappers expose only client-valid signatures and derive
-- time from the database clock.

alter function public.close_session(uuid, timestamptz) set schema app;
alter function public.void_session(uuid, text) set schema app;
alter function public.close_shift(uuid, timestamptz, numeric) set schema app;
alter function public.record_shift_count(uuid, numeric) set schema app;
alter function public.escalate_room_statuses(timestamptz) set schema app;

revoke all on function app.close_session(uuid, timestamptz), app.void_session(uuid, text),
  app.close_shift(uuid, timestamptz, numeric), app.record_shift_count(uuid, numeric),
  app.escalate_room_statuses(timestamptz) from public, anon, service_role;
grant execute on function app.close_session(uuid, timestamptz), app.void_session(uuid, text),
  app.close_shift(uuid, timestamptz, numeric), app.record_shift_count(uuid, numeric)
  to authenticated;

create or replace function public.close_session(row_session_id uuid)
returns numeric language sql volatile security invoker set search_path = '' as $$
  select app.close_session(row_session_id, clock_timestamp());
$$;
create or replace function public.void_session(row_session_id uuid, reason text)
returns text language sql volatile security invoker set search_path = '' as $$
  select app.void_session(row_session_id, reason);
$$;
create or replace function public.close_shift(row_shift_id uuid, counted_total numeric)
returns numeric language sql volatile security invoker set search_path = '' as $$
  select app.close_shift(row_shift_id, clock_timestamp(), counted_total);
$$;
create or replace function public.record_shift_count(row_shift_id uuid, counted_total numeric)
returns numeric language sql volatile security invoker set search_path = '' as $$
  select app.record_shift_count(row_shift_id, counted_total);
$$;

revoke all on function public.close_session(uuid), public.void_session(uuid, text),
  public.close_shift(uuid, numeric), public.record_shift_count(uuid, numeric)
  from public, anon, service_role;
grant execute on function public.close_session(uuid), public.void_session(uuid, text),
  public.close_shift(uuid, numeric), public.record_shift_count(uuid, numeric)
  to authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'silid-room-status-escalation';
select cron.schedule('silid-room-status-escalation', '* * * * *', 'select app.escalate_room_statuses()');
