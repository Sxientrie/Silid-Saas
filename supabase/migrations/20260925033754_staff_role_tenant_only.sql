-- Phase 03 corrective pass (attack-battery break fix): staff rows exist only
-- for tenant roles (spec/data-model.md §1 — "a platform_admin identity lives
-- in Supabase Auth with no tenant staff row"). The attack battery proved an
-- org_admin could mint a platform_admin staff row through the plain
-- PostgREST insert and update paths (suite 11, T35/T36/T37): the role CHECK
-- admitted 'platform_admin' for vocabulary completeness and no policy
-- refused it. Three layers, each doing the job the spec assigns it:
--
-- 1. The table CHECK is the every-writer guarantee: it binds client roles,
--    service_role (bypassrls — RLS cannot bind it), SECURITY DEFINER paths,
--    and fixtures, on BOTH the insert and update paths. The linked project
--    held zero staff rows when this was applied, so a validating constraint
--    is safe.
-- 2. The INSERT policy carries the tenant-role predicate because the RLS
--    WITH CHECK fires before table constraints (verified live on this
--    project, 2026-09-25): a tenant-tier insert of a platform_admin staff
--    row is refused with 42501 at the policy boundary, not 23514.
-- 3. The UPDATE policy loses the org-tier arm: the spec sanctions no
--    client-path mutation of staff rows for tenant tiers (provisioning rides
--    the trusted server path, deactivation is the revocation-first RPC —
--    spec/authentication.md §5); a direct client UPDATE path would even
--    allow flipping is_active without the paired session revocation. With no
--    permissive UPDATE policy, the tenant-tier rewrite of a staff row (e.g.
--    one's own role) is silently out of scope (rowcount 0), which is the
--    RLS-correct refusal the battery asserts. The platform arm keeps its
--    existing capability; the CHECK binds its vocabulary.

alter table public.staff drop constraint staff_role_check;

alter table public.staff
  add constraint staff_role_check check (role in ('cashier', 'org_admin'));

drop policy if exists staff_scoped_insert on public.staff;
create policy staff_scoped_insert on public.staff
for insert to authenticated
with check (
  (select app.is_platform_admin())
  or (
    select app.is_org_admin()
      and app.claim_org_id() = org_id
      and role in ('cashier', 'org_admin')
  )
);

drop policy if exists staff_scoped_update on public.staff;
create policy staff_scoped_update on public.staff
for update to authenticated
using ((select app.is_platform_admin()))
with check ((select app.is_platform_admin()));
