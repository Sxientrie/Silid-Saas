-- Phase 02 · Deliverables 3-4: tenancy and ledger RLS proof.
-- One behavior per assertion. Runs through supabase db test on a local stack
-- or the MCP equivalent against the linked project.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Deterministic fixtures live only for this transaction.
insert into public.organizations (id, name)
values
  ('10000000-0000-0000-0000-000000000001', 'Org A'),
  ('10000000-0000-0000-0000-000000000002', 'Org B');

insert into public.branches (id, org_id, name)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A1'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'A2'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'B1');

-- staff rows exist only for tenant roles (data-model §1; the Phase 03
-- corrective pass made it a table constraint), so the former platform_admin
-- fixture row carries a tenant role — no assertion reads this row, and the
-- platform claims below require no staff row by design.
insert into public.staff (id, org_id, branch_id, email, role, display_name)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'a1@example.test', 'cashier', 'A1 cashier'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'a2@example.test', 'cashier', 'A2 cashier'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'b1@example.test', 'cashier', 'B1 cashier'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', null, 'admin-b@example.test', 'org_admin', 'Org B admin'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', null, 'admin-a@example.test', 'org_admin', 'Org A admin'),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', null, 'platform@example.test', 'org_admin', 'Org B admin 2');

insert into public.rooms (id, org_id, branch_id, room_number)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A1-01'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'A2-01'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'B1-01');

insert into public.sessions (
  id, org_id, branch_id, room_id, cashier_id, booking_type, pax,
  checked_in_at, booked_end_at
)
values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'short_time', 2, now(), now() + interval '3 hours'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'short_time', 2, now(), now() + interval '3 hours'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'short_time', 2, now(), now() + interval '3 hours');

insert into public.session_addons (id, org_id, branch_id, session_id, item, qty, unit_price, total, cashier_id)
values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'pillow', 1, 50, 50, '30000000-0000-0000-0000-000000000001');

insert into public.canteen_sales (id, org_id, branch_id, item, qty, unit_price, total, cashier_id)
values ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'bottled_water', 1, 30, 30, '30000000-0000-0000-0000-000000000001');

insert into public.shifts (id, org_id, branch_id, opened_by)
values ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');

insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'check_in', 'sessions', '50000000-0000-0000-0000-000000000001');

-- Helper for repeated claim setup inside one transaction.
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

-- pg_temp must be schema-qualified in calls: the Supabase `authenticated`
-- role's search_path does not include the temp schema (verified live 2026-09-25).
select pg_temp._claims('30000000-0000-0000-0000-000000000001', 'cashier', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
select is((select count(*) from public.organizations where id = '10000000-0000-0000-0000-000000000001'), 0::bigint, 'vault-19: cashier cannot read platform-owned organization rows');
select is((select count(*) from public.rooms), 1::bigint, 'vault-19: branch 1 cashier sees only branch 1 rooms');
select is((select count(*) from public.sessions), 1::bigint, 'vault-19: branch 1 cashier sees only branch 1 sessions');
select is((select count(*) from public.session_addons), 1::bigint, 'vault-19: branch 1 cashier sees only branch 1 add-ons');
select is((select count(*) from public.canteen_sales), 1::bigint, 'vault-19: branch 1 cashier sees only branch 1 canteen sales');
select is((select count(*) from public.shifts), 1::bigint, 'vault-19: branch 1 cashier sees only branch 1 shifts');
select is((select count(*) from public.audit_log), 0::bigint, 'vault-17: cashiers do not review audit rows');
select is((select count(*) from public.rooms where id = '40000000-0000-0000-0000-000000000003'), 0::bigint, 'vault-19: explicit organization B room id is invisible');
select is((select count(*) from public.rooms where branch_id = '20000000-0000-0000-0000-000000000002'), 0::bigint, 'vault-19: explicit sibling-branch room id is invisible');

select throws_ok(
  $$ update public.rooms set room_number = 'HACKED'
     where id = '40000000-0000-0000-0000-000000000002' $$,
  '42501',
  'permission denied for table rooms',
  'vault-19: branch 1 cashier cannot update branch 2 room'
);

select pg_temp._claims('30000000-0000-0000-0000-000000000004', 'org_admin', '10000000-0000-0000-0000-000000000001', null);
select is((select count(*) from public.rooms), 2::bigint, 'vault-19: organization A admin sees both organization A branches');
select is((select count(*) from public.rooms where org_id = '10000000-0000-0000-0000-000000000002'), 0::bigint, 'vault-19: organization A admin cannot see organization B room');
select is((select count(*) from public.audit_log), 1::bigint, 'vault-17: organization A admin sees only organization A audit rows');

select pg_temp._claims('30000000-0000-0000-0000-000000000006', 'platform_admin', null, null);
-- The linked project is a shared dev surface: real operator-created
-- organizations coexist with the fixtures, so the platform visibility
-- proof counts the FIXTURE ids (both must be visible), not the table.
select is((select count(*) from public.organizations where id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')), 2::bigint, 'vault-19: platform admin sees all organizations');

reset role;
drop function pg_temp._claims(uuid, text, uuid, uuid);
select * from finish();
rollback;
