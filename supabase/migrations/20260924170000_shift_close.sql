-- Phase 02: shift close/count sealing and organization force-close.

create or replace function app.claim_role()
returns text language sql stable security invoker set search_path = '' as $$ select auth.jwt() -> 'app_metadata' ->> 'role'; $$;
create or replace function app.claim_org_id()
returns uuid language sql stable security invoker set search_path = '' as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid; $$;
create or replace function app.claim_branch_id()
returns uuid language sql stable security invoker set search_path = '' as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'branch_id', '')::uuid; $$;
create or replace function app.is_org_admin()
returns boolean language sql stable security invoker set search_path = '' as $$ select coalesce(app.claim_role() = 'org_admin', false); $$;
create or replace function app.is_cashier()
returns boolean language sql stable security invoker set search_path = '' as $$ select coalesce(app.claim_role() = 'cashier', false); $$;
create or replace function app.is_platform_admin()
returns boolean language sql stable security invoker set search_path = '' as $$ select coalesce(app.claim_role() = 'platform_admin', false); $$;
create or replace function app.in_org(row_org_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$ select app.is_platform_admin() or (app.is_org_admin() and app.claim_org_id() = row_org_id); $$;
create or replace function app.in_branch(row_org_id uuid, row_branch_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$ select app.is_platform_admin() or (app.is_org_admin() and app.claim_org_id() = row_org_id) or (app.is_cashier() and app.claim_org_id() = row_org_id and app.claim_branch_id() = row_branch_id); $$;
create or replace function app.lock_branch(row_branch_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$ begin perform 1 from public.branches where id = row_branch_id for update; end; $$;
revoke all on all functions in schema app from public, anon, authenticated;
grant execute on function app.claim_role(), app.claim_org_id(), app.claim_branch_id(), app.is_platform_admin(), app.is_org_admin(), app.is_cashier(), app.in_org(uuid), app.in_branch(uuid, uuid) to authenticated;

create or replace function public.close_shift(
  row_shift_id uuid,
  requested_closed_at timestamptz,
  counted_total numeric
) returns numeric language plpgsql security definer set search_path = '' as $$
declare shift_row public.shifts%rowtype; old_row jsonb; close_instant timestamptz;
  room_sum numeric; addon_sum numeric; canteen_sum numeric; expected numeric; sealed_variance numeric;
  requested_count numeric;
begin
  requested_count := counted_total;
  if auth.uid() is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if requested_count is not null and requested_count < 0 then raise exception using errcode = '22023', message = 'counted_total must be zero or positive'; end if;
  select * into shift_row from public.shifts where id = row_shift_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'shift not found'; end if;
  if not ((app.is_cashier() and app.claim_org_id() = shift_row.org_id and app.claim_branch_id() = shift_row.branch_id) or (app.is_org_admin() and app.claim_org_id() = shift_row.org_id)) then
    raise exception using errcode = '42501', message = 'shift is outside caller scope';
  end if;
  if shift_row.status <> 'open' then raise exception using errcode = 'P0001', message = 'shift is not open'; end if;
  perform app.lock_branch(shift_row.branch_id);
  close_instant := coalesce(requested_closed_at, clock_timestamp());
  if close_instant <= shift_row.opened_at then raise exception using errcode = '22023', message = 'shift close instant must follow open instant'; end if;

  select coalesce(sum(base_rate + surcharges), 0), coalesce(sum(total - base_rate - surcharges), 0)
    into room_sum, addon_sum
  from public.sessions
  where branch_id = shift_row.branch_id and status = 'closed'
    and checked_out_at >= shift_row.opened_at and checked_out_at < close_instant;
  select coalesce(sum(total), 0) into canteen_sum
  from public.canteen_sales
  where branch_id = shift_row.branch_id and sold_at >= shift_row.opened_at and sold_at < close_instant;
  expected := room_sum + addon_sum + canteen_sum;
  sealed_variance := case when requested_count is null then null else requested_count - expected end;
  old_row := to_jsonb(shift_row);

  update public.shifts set
    closed_by = auth.uid(), closed_at = close_instant,
    expected_room = room_sum, expected_addons = addon_sum, expected_canteen = canteen_sum,
    expected_total = expected, counted_total = requested_count, variance = sealed_variance,
    status = 'closed'
  where id = shift_row.id;

  insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id, old_data, new_data, ts)
  values (shift_row.org_id, shift_row.branch_id, auth.uid(), 'close_shift', 'shifts', shift_row.id, old_row,
    (select to_jsonb(s) from public.shifts s where s.id = shift_row.id), close_instant);
  return expected;
end;
$$;

create or replace function public.record_shift_count(row_shift_id uuid, counted_total numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
declare shift_row public.shifts%rowtype; old_row jsonb; sealed_variance numeric; requested_count numeric;
begin
  requested_count := counted_total;
  if auth.uid() is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if requested_count is null or requested_count < 0 then raise exception using errcode = '22023', message = 'counted_total must be zero or positive'; end if;
  select * into shift_row from public.shifts where id = row_shift_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'shift not found'; end if;
  if shift_row.status <> 'closed' then raise exception using errcode = 'P0001', message = 'shift is not closed'; end if;
  if not ((app.is_org_admin() and app.claim_org_id() = shift_row.org_id) or (app.is_cashier() and app.claim_org_id() = shift_row.org_id and app.claim_branch_id() = shift_row.branch_id and shift_row.opened_by = auth.uid())) then
    raise exception using errcode = '42501', message = 'count requires org_admin or shift opener';
  end if;
  if shift_row.counted_total is not null then raise exception using errcode = 'P0001', message = 'shift already has a recorded count'; end if;
  perform app.lock_branch(shift_row.branch_id);
  old_row := to_jsonb(shift_row);
  sealed_variance := requested_count - shift_row.expected_total;
  update public.shifts set counted_total = requested_count, variance = sealed_variance where id = shift_row.id;
  insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id, old_data, new_data, ts)
  values (shift_row.org_id, shift_row.branch_id, auth.uid(), 'record_shift_count', 'shifts', shift_row.id, old_row,
    (select to_jsonb(s) from public.shifts s where s.id = shift_row.id), clock_timestamp());
  return sealed_variance;
end;
$$;

revoke all on function public.close_shift(uuid, timestamptz, numeric), public.record_shift_count(uuid, numeric) from public, anon, service_role;
grant execute on function public.close_shift(uuid, timestamptz, numeric), public.record_shift_count(uuid, numeric) to authenticated;
