-- Phase 02: status-only pg_cron room escalation. The job derives the room
-- status from server time and session timestamps; it writes no money rows.

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated;

create or replace function app.overstay_params(row_branch_id uuid)
returns table(grace_minutes integer, block_minutes integer, block_charge numeric)
language plpgsql stable security invoker set search_path = '' as $$
declare cfg jsonb; grace_text text; block_text text; charge_text text;
begin
  select rate_config -> 'extension' into cfg from public.branches where id = row_branch_id;
  grace_text := cfg ->> 'grace_minutes';
  block_text := cfg ->> 'block_minutes';
  charge_text := cfg ->> 'block_charge';
  grace_minutes := case when grace_text ~ '^[0-9]{1,9}$' then grace_text::integer else 25 end;
  block_minutes := case when block_text ~ '^[0-9]{1,9}$' and block_text::integer > 0 then block_text::integer else 60 end;
  block_charge := case when charge_text ~ '^[0-9]{1,12}(\.[0-9]+)?$' and charge_text::numeric > 0 then charge_text::numeric else 150 end;
  return next;
end;
$$;
revoke all on function app.overstay_params(uuid) from public, anon, authenticated;

create or replace function public.escalate_room_statuses(as_at timestamptz default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed integer; effective_now timestamptz;
begin
  effective_now := coalesce(as_at, clock_timestamp());
  with desired as (
    select r.id,
      case
        when effective_now < s.booked_end_at then 'occupied'
        when effective_now < s.booked_end_at + make_interval(mins => p.grace_minutes) then 'grace'
        else 'overdue'
      end as next_status
    from public.sessions s
    join public.rooms r on r.id = s.room_id
    cross join lateral app.overstay_params(s.branch_id) p
    where s.status = 'active'
  ), changed_rows as (
    update public.rooms r set status = d.next_status
    from desired d
    where r.id = d.id and r.status <> d.next_status
    returning r.id
  )
  select count(*) into changed from changed_rows;
  return changed;
end;
$$;
revoke all on function public.escalate_room_statuses(timestamptz) from public, anon, authenticated, service_role;

-- Scheduler ownership stays with postgres. The callable RPC is intentionally
-- unavailable to every API role; tests invoke it as the migration owner.
select cron.unschedule(jobid) from cron.job where jobname = 'silid-room-status-escalation';
select cron.schedule('silid-room-status-escalation', '* * * * *', 'select public.escalate_room_statuses()');
