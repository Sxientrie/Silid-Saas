-- Phase 02: server-sealed time, claim-derived desk attribution, and
-- money-bearing insert guards. Client-facing inserts never accept authoritative
-- timestamps or money; the database derives them from claims and branch config.

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
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(app.claim_role() = 'platform_admin', false);
$$;
create or replace function app.is_org_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(app.claim_role() = 'org_admin', false);
$$;
create or replace function app.is_cashier()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(app.claim_role() = 'cashier', false);
$$;
create or replace function app.in_org(row_org_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select app.is_platform_admin() or (app.is_org_admin() and app.claim_org_id() = row_org_id);
$$;
create or replace function app.in_branch(row_org_id uuid, row_branch_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select app.is_platform_admin()
      or (app.is_org_admin() and app.claim_org_id() = row_org_id)
      or (app.is_cashier() and app.claim_org_id() = row_org_id and app.claim_branch_id() = row_branch_id);
$$;
create or replace function app.lock_branch(row_branch_id uuid)
returns void language sql security invoker set search_path = '' as $$
begin
  perform 1 from public.branches where id = row_branch_id for update;
end;
$$;

create or replace function app.require_open_shift(row_branch_id uuid)
returns void language sql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.shifts where branch_id = row_branch_id and status = 'open'
  ) then
    raise exception using errcode = 'P0001', message = 'an open shift is required';
  end if;
end;
$$;
create or replace function app.stay_duration_minutes(row_branch_id uuid, booking_type text)
returns integer language sql stable security invoker set search_path = '' as $$
declare cfg jsonb; fallback integer;
begin
  fallback := case when booking_type = 'short_time' then 180 else 720 end;
  select rate_config into cfg from public.branches where id = row_branch_id;
  return coalesce((cfg #>> array['stay_types', booking_type, 'duration_minutes'])::integer, fallback);
exception when others then
  return fallback;
end;
$$;
create or replace function app.item_price(row_branch_id uuid, catalogue_kind text, item text)
returns numeric language plpgsql stable security invoker set search_path = '' as $$
declare cfg jsonb; value_text text;
begin
  select rate_config into cfg from public.branches where id = row_branch_id;
  if catalogue_kind = 'addon' then
    value_text := cfg #>> array['addons', item];
  else
    value_text := cfg #>> array['canteen', 'overrides', item];
    if value_text is null then
      value_text := cfg #>> array['canteen', 'catalogue', item, 'price'];
    end if;
  end if;
  if value_text !~ '^[0-9]{1,12}(\.[0-9]+)?$' then
    raise exception 'unknown or invalid catalogue item: %', item using errcode = '22023';
  end if;
  return value_text::numeric;
end;
$$;

revoke all on all functions in schema app from public, anon, authenticated;
grant execute on function app.claim_role(), app.claim_org_id(), app.claim_branch_id(),
  app.is_platform_admin(), app.is_org_admin(), app.is_cashier(), app.in_org(uuid), app.in_branch(uuid, uuid)
  to authenticated;

create or replace function app.seal_session_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare duration_minutes integer;
begin
  if auth.uid() is not null then
    if not app.is_cashier() or auth.uid() <> new.cashier_id then
      raise exception using errcode = '42501', message = 'cashier claim does not own this check-in';
    end if;
    new.org_id := app.claim_org_id();
    new.branch_id := app.claim_branch_id();
    new.checked_in_at := clock_timestamp();
    duration_minutes := app.stay_duration_minutes(new.branch_id, new.booking_type);
    new.booked_end_at := new.checked_in_at + make_interval(mins => duration_minutes);
    new.base_rate := 0;
    new.surcharges := 0;
    new.total := 0;
    new.checked_out_at := null;
    new.status := 'active';
    new.void_reason := null;
    if not exists (
      select 1 from public.rooms r
      where r.id = new.room_id and r.org_id = new.org_id and r.branch_id = new.branch_id and r.status = 'vacant'
    ) then
      raise exception using errcode = '23514', message = 'room must be vacant in the cashier branch';
    end if;
    perform app.lock_branch(new.branch_id);
    perform app.require_open_shift(new.branch_id);
    update public.rooms set status = 'occupied' where id = new.room_id;
  end if;
  return new;
end;
$$;

create or replace function app.seal_addon_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare session_row public.sessions%rowtype;
begin
  if auth.uid() is not null then
    if new.item = 'extension_charge' and coalesce(current_setting('app.server_transition', true), '') <> 'extension_post' then
      raise exception using errcode = '23514', message = 'cashiers cannot post extension-charge rows';
    end if;
    select * into session_row from public.sessions where id = new.session_id;
    if session_row.status <> 'active' or session_row.org_id <> app.claim_org_id() or session_row.branch_id <> app.claim_branch_id() then
      raise exception using errcode = '23514', message = 'add-on session must be active in the cashier branch';
    end if;
    perform app.lock_branch(session_row.branch_id);
    perform app.require_open_shift(session_row.branch_id);
    new.org_id := session_row.org_id;
    new.branch_id := session_row.branch_id;
    new.cashier_id := auth.uid();
    new.added_at := clock_timestamp();
    new.unit_price := app.item_price(new.branch_id, 'addon', new.item);
    new.total := new.unit_price * new.qty;
  end if;
  return new;
end;
$$;

create or replace function app.seal_canteen_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    perform app.lock_branch(new.branch_id);
    perform app.require_open_shift(new.branch_id);
    new.org_id := app.claim_org_id();
    new.cashier_id := auth.uid();
    new.sold_at := clock_timestamp();
    new.unit_price := app.item_price(new.branch_id, 'canteen', new.item);
    new.total := new.unit_price * new.qty;
    if new.session_id is not null and not exists (
      select 1 from public.sessions s
      where s.id = new.session_id and s.org_id = new.org_id and s.branch_id = new.branch_id and s.status = 'active'
    ) then
      raise exception using errcode = '23514', message = 'canteen session must be active in the cashier branch';
    end if;
  end if;
  return new;
end;
$$;

create or replace function app.seal_shift_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.org_id := app.claim_org_id();
    new.branch_id := app.claim_branch_id();
    new.opened_by := auth.uid();
    new.opened_at := clock_timestamp();
    new.closed_by := null;
    new.closed_at := null;
    new.expected_room := 0;
    new.expected_addons := 0;
    new.expected_canteen := 0;
    new.expected_total := 0;
    new.counted_total := null;
    new.variance := null;
    new.status := 'open';
  end if;
  return new;
end;
$$;

create or replace function app.seal_audit_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.actor_id := auth.uid();
    new.ts := clock_timestamp();
    if not app.is_platform_admin() then
      new.org_id := app.claim_org_id();
      new.branch_id := app.claim_branch_id();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.seal_session_insert(), app.seal_addon_insert(), app.seal_canteen_insert(),
  app.seal_shift_insert(), app.seal_audit_insert() from public, anon, authenticated;

drop trigger if exists sessions_seal_time on public.sessions;
create trigger sessions_seal_time before insert on public.sessions for each row execute function app.seal_session_insert();
drop trigger if exists session_addons_seal_insert on public.session_addons;
create trigger session_addons_seal_insert before insert on public.session_addons for each row execute function app.seal_addon_insert();
drop trigger if exists canteen_sales_seal_insert on public.canteen_sales;
create trigger canteen_sales_seal_insert before insert on public.canteen_sales for each row execute function app.seal_canteen_insert();
drop trigger if exists shifts_seal_insert on public.shifts;
create trigger shifts_seal_insert before insert on public.shifts for each row execute function app.seal_shift_insert();
drop trigger if exists audit_log_seal_insert on public.audit_log;
create trigger audit_log_seal_insert before insert on public.audit_log for each row execute function app.seal_audit_insert();

-- The policy checks run after BEFORE triggers, so the trigger-derived scope is
-- what the WITH CHECK clauses evaluate.
