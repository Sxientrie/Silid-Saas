-- Phase 03 Deliverable 4: bind the app_metadata claims to the staff
-- profile rows (spec/authentication.md §2, §5; spec/multi-tenancy.md §3
-- Layer 3). From this migration, a tenant role's claims act ONLY when an
-- ACTIVE staff profile row exists whose role/org/branch match the claims
-- — a deactivated user's still-valid token stops acting immediately, a
-- forged claim without a profile row acts for nothing, and a
-- platform_admin claim must carry null tenant scope. The platform tier
-- keeps requiring no staff row (spec/data-model.md §1: platform
-- identities live only in Supabase Auth).

create or replace function app.claims_match_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case app.claim_role()
    when 'platform_admin' then
      app.claim_org_id() is null and app.claim_branch_id() is null
    when 'org_admin' then
      app.claim_branch_id() is null
      and exists (
        select 1 from public.staff s
        where s.id = (select auth.uid())
          and s.is_active
          and s.role = 'org_admin'
          and s.org_id = app.claim_org_id()
          and s.branch_id is null
      )
    when 'cashier' then exists (
      select 1 from public.staff s
      where s.id = (select auth.uid())
        and s.is_active
        and s.role = 'cashier'
        and s.org_id = app.claim_org_id()
        and s.branch_id = app.claim_branch_id()
    )
    else false
  end;
$$;

-- The role helpers are the single seam every policy, trigger, and RPC
-- authorization reads; tightening them binds everything at once.
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(app.claim_role() = 'platform_admin', false)
    and coalesce(app.claims_match_profile(), false);
$$;

create or replace function app.is_org_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(app.claim_role() = 'org_admin', false)
    and coalesce(app.claims_match_profile(), false);
$$;

create or replace function app.is_cashier()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(app.claim_role() = 'cashier', false)
    and coalesce(app.claims_match_profile(), false);
$$;

revoke all on function app.claims_match_profile() from public, anon, authenticated;
grant execute on function app.claims_match_profile() to authenticated;
