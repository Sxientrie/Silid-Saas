-- Phase 02 · Deliverable 13: vault-13 shift-close sealing, half-open windows,
-- cross-shift attribution, void exclusion, one-shot count, and force close.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.organizations (id, name)
values ('15000000-0000-0000-0000-000000000001', 'Shift org');
insert into public.branches (id, org_id, name)
values ('25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'Shift branch');
insert into public.staff (id, org_id, branch_id, email, role, display_name)
values
  ('35000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', 'cashier@example.test', 'cashier', 'Cashier'),
  ('35000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000001', null, 'admin@example.test', 'org_admin', 'Admin');
insert into public.shifts (id, org_id, branch_id, opened_by, opened_at)
values ('85000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', '2026-01-15 08:00:00+00');
insert into public.rooms (id, org_id, branch_id, room_number)
values
  ('45000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '401'),
  ('45000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '402'),
  ('45000000-0000-0000-0000-000000000003', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '403');

insert into public.sessions (id, org_id, branch_id, room_id, cashier_id, booking_type, pax, base_rate, surcharges, total, checked_in_at, booked_end_at, checked_out_at, status)
values
  ('55000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'short_time', 3, 450, 200, 700, '2026-01-15 07:00:00+00', '2026-01-15 10:00:00+00', '2026-01-15 09:00:00+00', 'closed'),
  ('55000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000001', 'overnight', 5, 1700, 300, 2300, '2026-01-14 17:00:00+00', '2026-01-15 05:00:00+00', '2026-01-15 12:00:00+00', 'closed'),
  ('55000000-0000-0000-0000-000000000003', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000003', '35000000-0000-0000-0000-000000000001', 'short_time', 2, 450, 0, 900, '2026-01-15 07:00:00+00', '2026-01-15 10:00:00+00', '2026-01-15 08:00:00+00', 'voided');
insert into public.canteen_sales (id, org_id, branch_id, item, qty, unit_price, total, sold_at, cashier_id)
values
  ('75000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', 'bottled_water', 2, 30, 60, '2026-01-15 08:00:00+00', '35000000-0000-0000-0000-000000000001'),
  ('75000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', 'bottled_water', 1, 30, 30, '2026-01-15 13:00:00+00', '35000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', '{"sub":"35000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"cashier","org_id":"15000000-0000-0000-0000-000000000001","branch_id":"25000000-0000-0000-0000-000000000001"}}', true);
set local role authenticated;
select is(app.close_shift('85000000-0000-0000-0000-000000000001', '2026-01-15 13:00:00+00'::timestamptz, null)::numeric, 3060::numeric, 'vault-13: cross-shift checkout and in-window canteen reach later shift');
select is((select expected_room from public.shifts where id = '85000000-0000-0000-0000-000000000001'), 2650::numeric, 'vault-13: room bucket is base plus surcharge by checkout instant');
select is((select expected_addons from public.shifts where id = '85000000-0000-0000-0000-000000000001'), 350::numeric, 'vault-13: add-on bucket is session total minus base and surcharge');
select is((select expected_canteen from public.shifts where id = '85000000-0000-0000-0000-000000000001'), 60::numeric, 'vault-13: half-open window includes start, excludes close');
select is((select expected_total from public.shifts where id = '85000000-0000-0000-0000-000000000001'), 3060::numeric, 'vault-13: expected total combines three buckets');
select is((select count(*) from public.shifts where id = '85000000-0000-0000-0000-000000000001' and status = 'voided'), 0::bigint, 'vault-13: voided session is excluded but cannot mutate shift history');
select throws_ok(
  $$ select app.close_shift('85000000-0000-0000-0000-000000000001', '2026-01-15 14:00:00+00'::timestamptz, null) $$,
  'P0001', 'shift is not open', 'vault-13: second close is refused'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"35000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"cashier","org_id":"15000000-0000-0000-0000-000000000001","branch_id":"25000000-0000-0000-0000-000000000001"}}', true);
set local role authenticated;
select is(app.record_shift_count('85000000-0000-0000-0000-000000000001', 3000)::numeric, -60::numeric, 'vault-13: opener records one-shot count and negative variance');
select throws_ok(
  $$ select app.record_shift_count('85000000-0000-0000-0000-000000000001', 2999) $$,
  'P0001', 'shift already has a recorded count', 'vault-13: count is one-shot'
);
reset role;

-- Clear the claims GUC before the trusted-path fixture insert: it is
-- transaction-local and would otherwise survive the role reset, making the
-- seal trigger overwrite the fixture's opened_at with the current clock.
select set_config('request.jwt.claims', 'null', true);
insert into public.shifts (id, org_id, branch_id, opened_by, opened_at)
values ('85000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', '2026-01-15 14:00:00+00');
select set_config('request.jwt.claims', '{"sub":"35000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"org_admin","org_id":"15000000-0000-0000-0000-000000000001","branch_id":null}}', true);
set local role authenticated;
select is(app.close_shift('85000000-0000-0000-0000-000000000002', '2026-01-15 15:00:00+00'::timestamptz, 0)::numeric, 0::numeric, 'vault-13: organization admin may force-close a branch shift');
select is((select variance from public.shifts where id = '85000000-0000-0000-0000-000000000002'), 0::numeric, 'vault-13: count at close seals exact variance');
select is((select count(*) from public.audit_log where target_id = '85000000-0000-0000-0000-000000000001' and action = 'close_shift'), 1::bigint, 'vault-13/17: close writes one audit row');
select is((select count(*) from public.audit_log where target_id = '85000000-0000-0000-0000-000000000001' and action = 'record_shift_count'), 1::bigint, 'vault-13/17: count writes one audit row');

reset role;
select * from finish();
rollback;
