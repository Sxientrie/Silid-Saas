-- Phase 02: server-computed checkout totals, extension deficit posting,
-- admin-only void, and their same-transaction audit trail.

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated;

create or replace function app.claim_role()
returns text language sql stable security invoker set search_path = '' as $$
  select auth.jwt() -> 'app_metadata' ->> 'role';
$$;
create or replace function app.claim_org_id()
returns uuid language sql stable security invoker set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid;
$$;
create or replace function app.claim_branch_id()
returns uuid language sql stable security invoker set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'branch_id', '')::uuid;
$$;
create or replace function app.is_platform_admin()
returns boolean language sql stable security invoker set search_path = '' as $$ select coalesce(app.claim_role() = 'platform_admin', false); $$;
create or replace function app.is_org_admin()
returns boolean language sql stable security invoker set search_path = '' as $$ select coalesce(app.claim_role() = 'org_admin', false); $$;
create or replace function app.is_cashier()
returns boolean language sql stable security invoker set search_path = '' as $$ select coalesce(app.claim_role() = 'cashier', false); $$;
create or replace function app.in_org(row_org_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$ select app.is_platform_admin() or (app.is_org_admin() and app.claim_org_id() = row_org_id); $$;
create or replace function app.in_branch(row_org_id uuid, row_branch_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$ select app.is_platform_admin() or (app.is_org_admin() and app.claim_org_id() = row_org_id) or (app.is_cashier() and app.claim_org_id() = row_org_id and app.claim_branch_id() = row_branch_id); $$;
create or replace function app.lock_branch(row_branch_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.branches where id = row_branch_id for update;
end;
$$;
create or replace function app.require_open_shift(row_branch_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.shifts where branch_id = row_branch_id and status = 'open') then
    raise exception using errcode = 'P0001', message = 'an open shift is required';
  end if;
end;
$$;
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
create or replace function app.stay_amounts(row_branch_id uuid, booking_type text, pax integer)
returns table(base numeric, surcharge numeric)
language plpgsql stable security invoker set search_path = '' as $$
declare cfg jsonb; base_pax integer; extra numeric; tier_key text;
begin
  select rate_config -> 'stay_types' -> booking_type into cfg from public.branches where id = row_branch_id;
  if booking_type = 'short_time' then
    base_pax := coalesce((cfg ->> 'base_pax')::integer, 2);
    extra := coalesce((cfg ->> 'extra_pax_charge')::numeric, 200);
    base := coalesce((cfg ->> 'flat_base')::numeric, 450);
  else
    base_pax := coalesce((cfg ->> 'surcharge_base_pax')::integer, 4);
    extra := coalesce((cfg ->> 'extra_pax_charge')::numeric, 300);
    select key into tier_key from jsonb_each_text(cfg -> 'tiers')
    where key::integer <= pax order by key::integer desc limit 1;
    if tier_key is null then
      -- vault-03: a one-guest booking resolves to the lowest tier.
      select key into tier_key from jsonb_each_text(cfg -> 'tiers')
      order by key::integer asc limit 1;
    end if;
    base := coalesce((cfg -> 'tiers' ->> tier_key)::numeric, 1100);
  end if;
  surcharge := greatest(pax - base_pax, 0) * extra;
  return next;
end;
$$;
create or replace function app.extension_blocks_due(row_branch_id uuid, row_booked_end timestamptz, checkout_at timestamptz)
returns integer language plpgsql stable security invoker set search_path = '' as $$
declare params record; overdue_seconds numeric;
begin
  select * into params from app.overstay_params(row_branch_id);
  overdue_seconds := extract(epoch from (checkout_at - (row_booked_end + make_interval(mins => params.grace_minutes))))::numeric;
  if overdue_seconds <= 0 then return 0; end if;
  return ceil(overdue_seconds / (params.block_minutes * 60))::integer;
end;
$$;

revoke all on all functions in schema app from public, anon, authenticated;
grant execute on function app.claim_role(), app.claim_org_id(), app.claim_branch_id(),
  app.is_platform_admin(), app.is_org_admin(), app.is_cashier(), app.in_org(uuid), app.in_branch(uuid, uuid) to authenticated;

create or replace function public.close_session(row_session_id uuid, requested_checkout_at timestamptz default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  session_row public.sessions%rowtype;
  old_row jsonb;
  amounts record;
  params record;
  checkout_instant timestamptz;
  existing_blocks integer;
  blocks_due integer;
  deficit integer;
  addon_total numeric;
  extension_total numeric;
  computed_total numeric;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if not (
    (app.is_cashier() and app.claim_branch_id() is not null)
    or app.is_org_admin()
  ) then
    raise exception using errcode = '42501', message = 'checkout is not permitted for this role';
  end if;

  select * into session_row from public.sessions where id = row_session_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'session not found'; end if;
  if session_row.status <> 'active' then raise exception using errcode = 'P0001', message = 'session is not active'; end if;
  if not (
    (app.is_cashier() and app.claim_org_id() = session_row.org_id and app.claim_branch_id() = session_row.branch_id)
    or (app.is_org_admin() and app.claim_org_id() = session_row.org_id)
  ) then
    raise exception using errcode = '42501', message = 'session is outside caller scope';
  end if;

  perform app.lock_branch(session_row.branch_id);
  perform app.require_open_shift(session_row.branch_id);
  select * into amounts from app.stay_amounts(session_row.branch_id, session_row.booking_type, session_row.pax);
  select coalesce(sum(total) filter (where item <> 'extension_charge'), 0) into addon_total
  from public.session_addons where session_id = session_row.id;
  checkout_instant := coalesce(requested_checkout_at, clock_timestamp());
  select * into params from app.overstay_params(session_row.branch_id);
  blocks_due := app.extension_blocks_due(session_row.branch_id, session_row.booked_end_at, checkout_instant);
  select coalesce(sum(qty), 0) into existing_blocks from public.session_addons
  where session_id = session_row.id and item = 'extension_charge';
  deficit := greatest(blocks_due - existing_blocks, 0);
  extension_total := deficit * params.block_charge;
  computed_total := amounts.base + amounts.surcharge + addon_total + extension_total;
  old_row := to_jsonb(session_row);

  if deficit > 0 then
    perform set_config('app.server_transition', 'extension_post', true);
    insert into public.session_addons (org_id, branch_id, session_id, item, qty, unit_price, total, added_at, cashier_id)
    values (session_row.org_id, session_row.branch_id, session_row.id, 'extension_charge', deficit, params.block_charge, extension_total, checkout_instant, session_row.cashier_id);
    perform set_config('app.server_transition', '', true);
  end if;

  update public.sessions set
    base_rate = amounts.base,
    surcharges = amounts.surcharge,
    total = computed_total,
    checked_out_at = checkout_instant,
    status = 'closed'
  where id = session_row.id
  returning total into computed_total;

  update public.rooms set status = 'vacant' where id = session_row.room_id;
  insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id, old_data, new_data, ts)
  values (session_row.org_id, session_row.branch_id, auth.uid(), 'check_out', 'sessions', session_row.id, old_row,
    (select to_jsonb(s) from public.sessions s where s.id = session_row.id), checkout_instant);
  return computed_total;
end;
$$;

create or replace function public.void_session(row_session_id uuid, reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare session_row public.sessions%rowtype; old_row jsonb;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if not app.is_org_admin() then raise exception using errcode = '42501', message = 'only org_admin may void sessions'; end if;
  if btrim(coalesce(reason, '')) = '' then raise exception using errcode = '22023', message = 'void reason is required'; end if;
  select * into session_row from public.sessions where id = row_session_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'session not found'; end if;
  if session_row.org_id <> app.claim_org_id() then raise exception using errcode = '42501', message = 'session is outside caller organization'; end if;
  if session_row.status not in ('active', 'closed') then raise exception using errcode = 'P0001', message = 'session cannot be voided from its current status'; end if;
  perform app.lock_branch(session_row.branch_id);
  old_row := to_jsonb(session_row);
  update public.sessions set status = 'voided', void_reason = btrim(reason) where id = session_row.id;
  if session_row.status = 'active' then
    update public.rooms set status = 'vacant' where id = session_row.room_id;
  end if;
  insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id, old_data, new_data, ts)
  values (session_row.org_id, session_row.branch_id, auth.uid(), 'void_session', 'sessions', session_row.id, old_row,
    (select to_jsonb(s) from public.sessions s where s.id = session_row.id), clock_timestamp());
  return 'voided';
end;
$$;

revoke all on function public.close_session(uuid, timestamptz), public.void_session(uuid, text) from public, anon, service_role;
grant execute on function public.close_session(uuid, timestamptz), public.void_session(uuid, text) to authenticated;
