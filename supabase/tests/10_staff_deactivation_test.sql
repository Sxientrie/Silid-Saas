-- Phase 03 · Deliverables 3-4: staff deactivation as revocation and the
-- claims↔profile binding. One behavior per assertion. Runs through
-- supabase db test on a local stack or the MCP equivalent against the
-- linked project.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Deterministic fixtures live only for this transaction.
insert into public.organizations (id, name)
values
  ('11000000-0000-0000-0000-000000000001', 'Org A'),
  ('11000000-0000-0000-0000-000000000002', 'Org B');

insert into public.branches (id, org_id, name)
values
  ('22000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'A1'),
  ('22000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'B1');

insert into public.rooms (id, org_id, branch_id, room_number)
values
  ('44000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'A1-01'),
  ('44000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'B1-01');

-- Tenant staff: cashier and org_admin in Org A; org_admin in Org B.
-- The platform tier carries NO staff row (spec/data-model.md §1).
insert into public.staff (id, org_id, branch_id, email, role, display_name)
values
  ('33000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'c1@example.test', 'cashier', 'A1 cashier'),
  ('33000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'c2@example.test', 'cashier', 'A1 cashier two'),
  ('33000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', null, 'admin-a@example.test', 'org_admin', 'Org A admin'),
  ('33000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000002', null, 'admin-b@example.test', 'org_admin', 'Org B admin');

-- A live session for the cashier, so the deactivation has something to
-- revoke. auth.sessions.user_id references auth.users, so the two staff
-- identities also need shadow auth-user rows (transaction-scoped fixtures).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('33000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'c1@example.test', '', now(), now(), now(), '{}', '{}'),
  ('33000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'c2@example.test', '', now(), now(), now(), '{}', '{}');

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('55000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', now(), now()),
  ('55000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', now(), now());

create function pg_temp._claims(p_user uuid, p_role text, p_org uuid, p_branch uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', p_role, 'org_id', p_org, 'branch_id', p_branch)
    )::text,
    true
  );
end;
$$;

set local role authenticated;

-- pg_temp must be schema-qualified in calls (verified live 2026-09-25).

-- ═══ Deliverable 4: claims-derived scope must match active profile rows ═══

select pg_temp._claims('33000000-0000-0000-0000-000000000001', 'cashier', '11000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001');
select is(
  (select count(*) from public.rooms),
  1::bigint,
  'a cashier whose claims match an active staff profile row sees its branch'
);

select pg_temp._claims('99000000-0000-0000-0000-000000000099', 'cashier', '11000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001');
select is(
  (select count(*) from public.rooms),
  0::bigint,
  'claims with NO staff profile row act for nothing (forged scope refused)'
);

select pg_temp._claims('33000000-0000-0000-0000-000000000003', 'cashier', '11000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001');
select is(
  (select count(*) from public.rooms),
  0::bigint,
  'claims whose role mismatches the profile row act for nothing'
);

select pg_temp._claims('33000000-0000-0000-0000-000000000004', 'org_admin', '11000000-0000-0000-0000-000000000001', null);
select is(
  (select count(*) from public.rooms),
  0::bigint,
  'claims whose org mismatches the profile row act for nothing'
);

select pg_temp._claims('33000000-0000-0000-0000-000000000003', 'org_admin', '11000000-0000-0000-0000-000000000001', null);
select is(
  (select count(*) from public.rooms),
  1::bigint,
  'an org_admin with matching active profile sees its org branch'
);

select pg_temp._claims('33000000-0000-0000-0000-000000000003', 'org_admin', '11000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002');
select is(
  (select count(*) from public.rooms),
  0::bigint,
  'an org_admin claim carrying a branch_id acts for nothing (§2 shape violation)'
);

select pg_temp._claims('99000000-0000-0000-0000-000000000098', 'platform_admin', '11000000-0000-0000-0000-000000000001', null);
select is(
  (select count(*) from public.rooms),
  0::bigint,
  'a platform_admin claim carrying tenant scope acts for nothing (§2 shape violation)'
);

select pg_temp._claims('99000000-0000-0000-0000-000000000099', 'platform_admin', null, null);
select is(
  (select count(*) from public.rooms),
  2::bigint,
  'a well-formed platform_admin claim (no staff row required) sees all organizations'
);

-- ═══ Deliverable 3: deactivation revokes sessions first, then flips the profile ═══

-- Session-table reads run as the postgres role inside the transaction:
-- auth.sessions is GoTrue-internal and gains no client-facing grant.
set local role postgres;
select is(
  (select count(*) from auth.sessions where user_id = '33000000-0000-0000-0000-000000000001'),
  2::bigint,
  'pre-condition: the cashier holds two live sessions'
);
set local role authenticated;
select pg_temp._claims('33000000-0000-0000-0000-000000000003', 'org_admin', '11000000-0000-0000-0000-000000000001', null);

select is(
  app.deactivate_staff('33000000-0000-0000-0000-000000000001'),
  'deactivated',
  'the org_admin of the same organization deactivates its cashier'
);

set local role postgres;
select is(
  (select count(*) from auth.sessions where user_id = '33000000-0000-0000-0000-000000000001'),
  0::bigint,
  'deactivation revokes the sessions FIRST — all of them, in the same transaction'
);
set local role authenticated;

select is(
  (select is_active from public.staff where id = '33000000-0000-0000-0000-000000000001'),
  false,
  'deactivation marks the profile inactive'
);

select is(
  (select count(*) from public.audit_log where action = 'deactivate_staff' and target_id = '33000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the deactivation writes one audit row attributed to the caller'
);

select throws_ok(
  $$ select app.deactivate_staff('33000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'staff member is already inactive',
  'deactivation is not re-runnable on an inactive profile'
);

-- The deactivated user's STILL-VALID token stops acting: the claims GUC
-- (a stale JWT) matches nothing because the profile row is inactive.
select pg_temp._claims('33000000-0000-0000-0000-000000000001', 'cashier', '11000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001');
select is(
  (select count(*) from public.rooms),
  0::bigint,
  'a deactivated user''s stale token acts for nothing at the database layer'
);

select pg_temp._claims('33000000-0000-0000-0000-000000000004', 'org_admin', '11000000-0000-0000-0000-000000000002', null);
select throws_ok(
  $$ select app.deactivate_staff('33000000-0000-0000-0000-000000000002') $$,
  '42501',
  'cross-tenant deactivation refused',
  'an org_admin of organization B cannot deactivate organization A staff'
);

select pg_temp._claims('33000000-0000-0000-0000-000000000002', 'cashier', '11000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select app.deactivate_staff('33000000-0000-0000-0000-000000000002') $$,
  '42501',
  'caller role cannot deactivate staff',
  'a cashier cannot deactivate anyone'
);

-- The platform tier can deactivate any staff member.
select pg_temp._claims('99000000-0000-0000-0000-000000000099', 'platform_admin', null, null);
select is(
  app.deactivate_staff('33000000-0000-0000-0000-000000000002'),
  'deactivated',
  'the platform tier deactivates staff of any organization'
);
select is(
  (select is_active from public.staff where id = '33000000-0000-0000-0000-000000000002'),
  false,
  'the platform deactivation marked the profile inactive'
);

select * from finish();
rollback;
