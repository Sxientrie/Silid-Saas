-- Phase 03 Deliverable 3: deactivation is revocation
-- (spec/authentication.md §5). One server transaction: revoke the staff
-- member's sessions FIRST (a deleted token stays valid until expiry, so
-- the refresh capability must die before the profile flips), then mark
-- the profile inactive, then write the audit row. Caller authorization
-- comes from the verified JWT's app_metadata claims — the org tier may
-- deactivate only within its own organization; the platform tier any
-- staff member. SECURITY DEFINER is genuinely required: auth.sessions is
-- not writable by tenant roles and the deactivation must be atomic; the
-- checklist rules are followed (non-exposed schema, in-body
-- authorization from claims, EXECUTE revoked from public/anon).

create or replace function app.deactivate_staff(p_target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.staff%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'caller must be authenticated';
  end if;
  -- The caller's claims must match an active staff profile row (the bound
  -- helpers): a deactivated org_admin's stale token deactivates nothing.
  if not (coalesce(app.is_platform_admin(), false) or coalesce(app.is_org_admin(), false)) then
    raise exception using errcode = '42501', message = 'caller role cannot deactivate staff';
  end if;

  select * into v_target from public.staff where id = p_target_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'staff profile not found';
  end if;
  if coalesce(app.is_org_admin(), false) and v_target.org_id <> app.claim_org_id() then
    raise exception using errcode = '42501', message = 'cross-tenant deactivation refused';
  end if;
  if not v_target.is_active then
    raise exception using errcode = 'P0001', message = 'staff member is already inactive';
  end if;

  -- Sessions first: the still-valid access tokens lose their refresh
  -- capability now; the profile flip below is what stops the tokens
  -- themselves at the database layer (claims stay stale until refresh).
  delete from auth.sessions where user_id = p_target_user_id;

  update public.staff set is_active = false where id = p_target_user_id;

  -- The audit trigger seals actor/ts and claim-derived org attribution.
  insert into public.audit_log (actor_id, action, target_table, target_id, old_data, new_data)
  values (
    auth.uid(),
    'deactivate_staff',
    'staff',
    p_target_user_id,
    to_jsonb(v_target),
    jsonb_build_object('id', p_target_user_id, 'is_active', false)
  );

  return 'deactivated';
end;
$$;

create or replace function public.deactivate_staff(p_target_user_id uuid)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select app.deactivate_staff(p_target_user_id);
$$;

revoke all on function app.deactivate_staff(uuid) from public, anon, authenticated, service_role;
grant execute on function app.deactivate_staff(uuid) to authenticated;
revoke all on function public.deactivate_staff(uuid) from public, anon, service_role;
grant execute on function public.deactivate_staff(uuid) to authenticated;
