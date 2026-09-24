-- Phase 02: claim-scoped RLS policies. The functions below read only
-- app_metadata from the verified JWT; no user_metadata claim participates in
-- authorization.

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated;

create or replace function app.claim_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.jwt() -> 'app_metadata' ->> 'role';
$$;

create or replace function app.claim_org_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid;
$$;

create or replace function app.claim_branch_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'branch_id', '')::uuid;
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(app.claim_role() = 'platform_admin', false);
$$;

create or replace function app.is_org_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(app.claim_role() = 'org_admin', false);
$$;

create or replace function app.is_cashier()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(app.claim_role() = 'cashier', false);
$$;

create or replace function app.in_org(row_org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app.is_platform_admin() or (app.is_org_admin() and app.claim_org_id() = row_org_id);
$$;

create or replace function app.in_branch(row_org_id uuid, row_branch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app.is_platform_admin()
      or (app.is_org_admin() and app.claim_org_id() = row_org_id)
      or (app.is_cashier() and app.claim_org_id() = row_org_id and app.claim_branch_id() = row_branch_id);
$$;

revoke all on all functions in schema app from public, anon;
grant execute on function app.claim_role(), app.claim_org_id(), app.claim_branch_id(),
  app.is_platform_admin(), app.is_org_admin(), app.is_cashier(), app.in_org(uuid), app.in_branch(uuid, uuid)
  to authenticated;

-- Platform-owned organizations.
drop policy if exists organizations_platform_select on public.organizations;
create policy organizations_platform_select on public.organizations
for select to authenticated
using ((select app.is_platform_admin()) or (select app.in_org(id)));

drop policy if exists organizations_platform_insert on public.organizations;
create policy organizations_platform_insert on public.organizations
for insert to authenticated
with check ((select app.is_platform_admin()));

drop policy if exists organizations_platform_update on public.organizations;
create policy organizations_platform_update on public.organizations
for update to authenticated
using ((select app.is_platform_admin()))
with check ((select app.is_platform_admin()));

-- Organization-owned branches.
drop policy if exists branches_scoped_select on public.branches;
create policy branches_scoped_select on public.branches
for select to authenticated
using ((select app.in_branch(org_id, id)));

drop policy if exists branches_scoped_insert on public.branches;
create policy branches_scoped_insert on public.branches
for insert to authenticated
with check ((select app.is_platform_admin()) or (select app.is_org_admin() and app.claim_org_id() = org_id));

drop policy if exists branches_scoped_update on public.branches;
create policy branches_scoped_update on public.branches
for update to authenticated
using ((select app.is_platform_admin()) or (select app.is_org_admin() and app.claim_org_id() = org_id))
with check ((select app.is_platform_admin()) or (select app.is_org_admin() and app.claim_org_id() = org_id));

-- Staff: cashiers see their own row; organization admins see their org; the
-- platform tier sees all. Tenant rows never contain platform identities.
drop policy if exists staff_scoped_select on public.staff;
create policy staff_scoped_select on public.staff
for select to authenticated
using (
  (select app.is_platform_admin())
  or (select app.is_org_admin() and app.claim_org_id() = org_id)
  or ((select app.is_cashier()) and (select auth.uid()) = id)
);

drop policy if exists staff_scoped_insert on public.staff;
create policy staff_scoped_insert on public.staff
for insert to authenticated
with check ((select app.is_platform_admin()) or (select app.is_org_admin() and app.claim_org_id() = org_id));

drop policy if exists staff_scoped_update on public.staff;
create policy staff_scoped_update on public.staff
for update to authenticated
using ((select app.is_platform_admin()) or (select app.is_org_admin() and app.claim_org_id() = org_id))
with check ((select app.is_platform_admin()) or (select app.is_org_admin() and app.claim_org_id() = org_id));

-- Master room reads. The room-status column is never directly writable; the
-- named server transitions own all status changes.
drop policy if exists rooms_scoped_select on public.rooms;
create policy rooms_scoped_select on public.rooms
for select to authenticated
using ((select app.in_branch(org_id, branch_id)));

drop policy if exists rooms_scoped_insert on public.rooms;
create policy rooms_scoped_insert on public.rooms
for insert to authenticated
with check ((select app.is_platform_admin()) or (select app.is_org_admin() and app.claim_org_id() = org_id));

-- Read-only transactional ledgers for their scope.
drop policy if exists sessions_scoped_select on public.sessions;
create policy sessions_scoped_select on public.sessions
for select to authenticated
using ((select app.in_branch(org_id, branch_id)));

drop policy if exists sessions_scoped_insert on public.sessions;
create policy sessions_scoped_insert on public.sessions
for insert to authenticated
with check ((select app.is_cashier()) and (select app.claim_org_id()) = org_id and (select app.claim_branch_id()) = branch_id and (select auth.uid()) = cashier_id);

drop policy if exists session_addons_scoped_select on public.session_addons;
create policy session_addons_scoped_select on public.session_addons
for select to authenticated
using ((select app.in_branch(org_id, branch_id)));

drop policy if exists session_addons_scoped_insert on public.session_addons;
create policy session_addons_scoped_insert on public.session_addons
for insert to authenticated
with check ((select app.is_cashier()) and (select app.claim_org_id()) = org_id and (select app.claim_branch_id()) = branch_id and (select auth.uid()) = cashier_id);

drop policy if exists canteen_sales_scoped_select on public.canteen_sales;
create policy canteen_sales_scoped_select on public.canteen_sales
for select to authenticated
using ((select app.in_branch(org_id, branch_id)));

drop policy if exists canteen_sales_scoped_insert on public.canteen_sales;
create policy canteen_sales_scoped_insert on public.canteen_sales
for insert to authenticated
with check ((select app.is_cashier()) and (select app.claim_org_id()) = org_id and (select app.claim_branch_id()) = branch_id and (select auth.uid()) = cashier_id);

drop policy if exists shifts_scoped_select on public.shifts;
create policy shifts_scoped_select on public.shifts
for select to authenticated
using ((select app.in_branch(org_id, branch_id)));

drop policy if exists shifts_scoped_insert on public.shifts;
create policy shifts_scoped_insert on public.shifts
for insert to authenticated
with check ((select app.is_cashier()) and (select app.claim_org_id()) = org_id and (select app.claim_branch_id()) = branch_id and (select auth.uid()) = opened_by);

-- Audit: tenant actors can append their own scoped row, but only the platform
-- and matching organization admins can review. Every role still has no
-- UPDATE/DELETE grant or policy.
drop policy if exists audit_scoped_select on public.audit_log;
create policy audit_scoped_select on public.audit_log
for select to authenticated
using ((select app.is_platform_admin()) or (select app.is_org_admin() and app.claim_org_id() = org_id));

drop policy if exists audit_scoped_insert on public.audit_log;
create policy audit_scoped_insert on public.audit_log
for insert to authenticated
with check (
  (select auth.uid()) = actor_id
  and (
    (select app.is_platform_admin())
    or (select app.is_org_admin() and app.claim_org_id() = org_id)
    or (select app.is_cashier() and app.claim_org_id() = org_id and app.claim_branch_id() = branch_id)
  )
);
