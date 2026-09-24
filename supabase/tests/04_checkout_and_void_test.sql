-- Phase 02 · Deliverables 5-6: checkout sealing and admin-only void.
-- Deterministic trusted fixtures establish sessions at known timestamps;
-- every RPC call below runs as a real authenticated JWT claim.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.organizations (id, name)
values ('12000000-0000-0000-0000-000000000001', 'Checkout org');
insert into public.branches (id, org_id, name)
values ('22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'Checkout branch');
insert into public.staff (id, org_id, branch_id, email, role, display_name)
values
  ('32000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'cashier@example.test', 'cashier', 'Cashier'),
  ('32000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000001', null, 'admin@example.test', 'org_admin', 'Admin');
insert into public.rooms (id, org_id, branch_id, room_number, status)
values
  ('42000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '201', 'occupied'),
  ('42000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '202', 'occupied');
insert into public.shifts (id, org_id, branch_id, opened_by, opened_at)
values ('82000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', now() - interval '1 day');

insert into public.sessions (id, org_id, branch_id, room_id, cashier_id, booking_type, pax, checked_in_at, booked_end_at)
values
  ('52000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'short_time', 2, now() - interval '2 hours', now() + interval '1 hour'),
  ('52000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000001', 'overnight', 5, now() - interval '14 hours', now() - interval '2 hours');
insert into public.session_addons (id, org_id, branch_id, session_id, item, qty, unit_price, total, cashier_id, added_at)
values ('62000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'pillow', 2, 50, 100, '32000000-0000-0000-0000-000000000001', now() - interval '90 minutes');

select set_config('request.jwt.claims', '{"sub":"32000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"cashier","org_id":"12000000-0000-0000-0000-000000000001","branch_id":"22000000-0000-0000-0000-000000000001"}}', true);
set local role authenticated;

select is((select app.close_session('52000000-0000-0000-0000-000000000001', now())), 550::numeric, 'vault-11: within-grace checkout is base 450 plus add-ons 100');
select is((select status from public.sessions where id = '52000000-0000-0000-0000-000000000001'), 'closed'::text, 'vault-11: checkout closes session');
select is((select status from public.rooms where id = '42000000-0000-0000-0000-000000000001'), 'vacant'::text, 'vault-11: checkout releases room');

select throws_ok(
  $$ select app.close_session('52000000-0000-0000-0000-000000000001', now()) $$,
  'P0001', 'session is not active', 'vault-11: double checkout is refused'
);

select is((select app.close_session('52000000-0000-0000-0000-000000000002', now() - interval '2 hours' + interval '86 minutes')), 2300::numeric, 'vault-06/11: 61 minutes past grace posts exactly two 150 blocks');
select is((select qty from public.session_addons where session_id = '52000000-0000-0000-0000-000000000002' and item = 'extension_charge'), 2, 'vault-06/11: second block deficit posts quantity two');
select is((select total from public.session_addons where session_id = '52000000-0000-0000-0000-000000000002' and item = 'extension_charge'), 300::numeric, 'vault-06/11: extension line total is 300');
select is((select count(*) from public.session_addons where session_id = '52000000-0000-0000-0000-000000000002' and item = 'extension_charge'), 1::bigint, 'vault-11: double-close cannot append a second extension line');

select throws_ok(
  $$ select app.void_session('52000000-0000-0000-0000-000000000001', 'cashier attempt') $$,
  '42501', 'only org_admin may void sessions', 'vault-12: cashier cannot void'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"32000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"org_admin","org_id":"12000000-0000-0000-0000-000000000001","branch_id":null}}', true);
set local role authenticated;
-- Audit review is organization-tier only: the admin reads back the checkout row.
select is((select count(*) from public.audit_log where target_id = '52000000-0000-0000-0000-000000000001' and action = 'check_out'), 1::bigint, 'vault-17: checkout writes one audit row');
select throws_ok(
  $$ select app.void_session('52000000-0000-0000-0000-000000000001', '   ') $$,
  '22023', 'void reason is required', 'vault-12: blank void reason is refused'
);
select is((select app.void_session('52000000-0000-0000-0000-000000000001', 'duplicate transaction')), 'voided'::text, 'vault-12: admin void marks session voided');
select is((select total from public.sessions where id = '52000000-0000-0000-0000-000000000001'), 550::numeric, 'vault-12: voiding a closed session leaves sealed money unchanged');
select is((select count(*) from public.audit_log where target_id = '52000000-0000-0000-0000-000000000001' and action = 'void_session'), 1::bigint, 'vault-12/17: void writes one same-transaction audit row');
select throws_ok(
  $$ update public.sessions set status = 'closed' where id = '52000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table sessions', 'vault-12: no path restores a voided charge'
);

reset role;
select * from finish();
rollback;
