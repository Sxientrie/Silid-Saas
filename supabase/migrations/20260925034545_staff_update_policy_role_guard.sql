-- Phase 03 corrective pass, second step (attack-battery break fix). The
-- battery asserts two DIFFERENT refusal shapes on the same staff row:
-- T37 wants the org-tier rewrite of one's own role to a non-tenant value to
-- be silently out of scope (rowcount 0), while T38 wants the org-tier
-- rewrite of one's own org_id to raise 42501. Plain RLS cannot express both
-- (policies cannot see the SET list; a policy refusal is the same error for
-- both, and a refusal error fails T37). Verified live before authoring:
-- a BEFORE UPDATE trigger runs before RLS and constraints, and returning
-- NULL skips the row without counting it.
--
-- 1. The UPDATE policy returns to its exact pre-break shape: the org-tier
--    arm's org-match WITH CHECK is what raises 42501 on the attribution
--    rewrite (T38). Nothing is weakened relative to the pre-fix access
--    model — the only removed capability is the role-mint hole itself.
-- 2. The trigger guard closes the role-vocabulary hole for EVERY writer on
--    the update path: a rewrite of role to a non-tenant value is silently
--    out of scope for the claims-bearing client path (PostgREST — the shape
--    the battery asserts) and a loud refusal for every other writer
--    (service_role, SECURITY DEFINER paths, fixtures). Insert-side
--    vocabulary is enforced by the tenant-only CHECK plus the tightened
--    INSERT policy (migration staff_role_tenant_only).

create or replace function app.staff_role_tenant_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and new.role not in ('cashier', 'org_admin') then
    -- Claims-bearing client path (PostgREST sets the verified JWT claims):
    -- the rewrite is out of scope — the row is skipped and not counted.
    if coalesce(app.claim_role(), '') in ('cashier', 'org_admin', 'platform_admin') then
      return null;
    end if;
    -- Every other writer gets the loud table-layer refusal.
    raise exception using
      errcode = '23514',
      message = 'staff rows exist only for tenant roles (cashier, org_admin)';
  end if;
  return new;
end;
$$;

create trigger staff_role_tenant_guard
before update on public.staff
for each row execute function app.staff_role_tenant_guard();

drop policy if exists staff_scoped_update on public.staff;
create policy staff_scoped_update on public.staff
for update to authenticated
using ((select app.is_platform_admin()) or (select app.is_org_admin() and app.claim_org_id() = org_id))
with check ((select app.is_platform_admin()) or (select app.is_org_admin() and app.claim_org_id() = org_id));
