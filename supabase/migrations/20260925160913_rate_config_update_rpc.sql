-- Phase 04: atomic rate-configuration merge with its same-transaction
-- audit entry (spec/data-model.md §2: "configuration changes write their
-- audit row in the same transaction as the change they record"; vault-12,
-- vault-17, vault-20). SECURITY INVOKER on purpose: the branches update and
-- the audit insert run under the CALLER's privileges, so the RLS policies
-- (branches_scoped_update, audit_scoped_insert) govern — this is not a
-- privilege-escalation shortcut — and the app.seal_audit_insert trigger
-- seals actor, time, org, and branch from the caller's verified claims.
-- Client-shaped actor/time arguments do not exist in the signature.
-- Applied via the Supabase MCP server (apply_migration) as version
-- 20260925160913; this file is the verbatim repo mirror.

create or replace function public.update_rate_config(
  row_branch_id uuid,
  canteen_overrides jsonb,
  extension_overrides jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_cfg jsonb;
  new_cfg jsonb;
  branch_org uuid;
  updated integer;
begin
  -- Visibility is RLS-scoped: an org admin of another organization finds
  -- nothing here (P0002), never the branch's rows.
  select rate_config, org_id into old_cfg, branch_org
    from public.branches where id = row_branch_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'branch not found';
  end if;

  -- The Phase 02 merge: strict refusals (22023) for values the runtime
  -- reader would ignore; unknown and unowned keys preserved (vault-20).
  new_cfg := public.merge_rate_config(row_branch_id, canteen_overrides, extension_overrides);

  update public.branches set rate_config = new_cfg where id = row_branch_id;
  get diagnostics updated = row_count;
  if updated = 0 then
    -- A cashier can read the branch but has no update policy row: refuse
    -- loudly instead of silently writing nothing (and never audit a change
    -- that did not happen).
    raise exception using errcode = '42501', message = 'not permitted to update this branch';
  end if;

  -- Same-transaction audit entry. Actor and time come from the database
  -- (auth.uid() + the seal trigger's clock_timestamp()); for tenant roles
  -- the seal trigger overwrites org/branch from the claims; platform-tier
  -- actions are audited with null org/branch (spec/multi-tenancy.md §5).
  insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id, old_data, new_data)
  values (
    case when app.is_platform_admin() then null else branch_org end,
    case when app.is_platform_admin() then null else row_branch_id end,
    auth.uid(),
    'update_rate_config',
    'branches',
    row_branch_id,
    old_cfg,
    new_cfg
  );

  return new_cfg;
end;
$$;

revoke all on function public.update_rate_config(uuid, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.update_rate_config(uuid, jsonb, jsonb) to authenticated;
