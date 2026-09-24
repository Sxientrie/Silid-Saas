-- Phase 02 · Deliverables 2-4: server-sealed time, append-only ledgers,
-- and direct desk-path refusals. One behavior per assertion.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into public.organizations (id, name)
values ('11000000-0000-0000-0000-000000000001', 'Append-only org');
insert into public.branches (id, org_id, name)
values ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Desk');
insert into public.staff (id, org_id, branch_id, email, role, display_name)
values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'cashier@example.test', 'cashier', 'Cashier'),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', null, 'admin@example.test', 'org_admin', 'Admin');
insert into public.rooms (id, org_id, branch_id, room_number)
values ('41000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '101');

select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"cashier","org_id":"11000000-0000-0000-0000-000000000001","branch_id":"21000000-0000-0000-0000-000000000001"}}', true);
set local role authenticated;

insert into public.shifts (id, org_id, branch_id, opened_by)
values ('81000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001');
select is((select opened_by from public.shifts where id = '81000000-0000-0000-0000-000000000001'), '31000000-0000-0000-0000-000000000001'::uuid, 'vault-13: shift opener comes from claims');
select is((select opened_at > now() - interval '5 seconds' from public.shifts where id = '81000000-0000-0000-0000-000000000001'), true, 'vault-13: shift open instant comes from database clock');

insert into public.sessions (id, org_id, branch_id, room_id, cashier_id, booking_type, pax, checked_in_at, booked_end_at)
values ('51000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'short_time', 2, '1900-01-01', '1901-01-01');
select is((select checked_in_at > now() - interval '5 seconds' from public.sessions where id = '51000000-0000-0000-0000-000000000001'), true, 'vault-04: client check-in time is ignored and replaced');
select is((select booked_end_at = checked_in_at + interval '3 hours' from public.sessions where id = '51000000-0000-0000-0000-000000000001'), true, 'vault-04: booked end is derived from check-in plus three hours');
select is((select status from public.rooms where id = '41000000-0000-0000-0000-000000000001'), 'occupied'::text, 'vault-10: check-in atomically occupies room');

insert into public.session_addons (org_id, branch_id, session_id, item, qty, unit_price, total, cashier_id)
values ('11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'pillow', 1, 999, 999, '31000000-0000-0000-0000-000000000001');
select is((select unit_price from public.session_addons), 50::numeric, 'vault-09: add-on unit price is recomputed from branch config');
select is((select total from public.session_addons), 50::numeric, 'vault-09: add-on total is recomputed on the server');

select throws_ok($$
  insert into public.session_addons (org_id, branch_id, session_id, item, qty, unit_price, total, cashier_id)
  values ('11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'extension_charge', 1, 150, 150, '31000000-0000-0000-0000-000000000001')
$$, '23514', 'cashiers cannot post extension-charge rows', 'vault-09: cashier hand-posting extension charge is refused');

select throws_ok($$
  insert into public.sessions (id, org_id, branch_id, room_id, cashier_id, booking_type, pax, checked_in_at, booked_end_at)
  values ('51000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'short_time', 2, now(), now() + interval '3 hours')
$$, '23505', 'duplicate key value violates unique constraint "one_active_session_per_room"', 'vault-16: second active session on one room is refused');

select throws_ok($$
  insert into public.shifts (id, org_id, branch_id, opened_by)
  values ('81000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001')
$$, '23505', 'duplicate key value violates unique constraint "one_open_shift_per_branch"', 'vault-16: second open shift on one branch is refused');

insert into public.canteen_sales (org_id, branch_id, item, qty, unit_price, total, cashier_id)
values ('11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'bottled_water', 1, 999, 999, '31000000-0000-0000-0000-000000000001');
select is((select unit_price from public.canteen_sales), 30::numeric, 'vault-08: canteen unit price is recomputed from branch config');
select is((select total from public.canteen_sales), 30::numeric, 'vault-08: canteen total is recomputed on the server');

insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id)
values ('11000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999', 'forged', 'sessions', '51000000-0000-0000-0000-000000000001');
select is((select actor_id from public.audit_log), '31000000-0000-0000-0000-000000000001'::uuid, 'vault-17: audit actor comes from claims');
select is((select branch_id from public.audit_log), '21000000-0000-0000-0000-000000000001'::uuid, 'vault-17: audit branch comes from claims');

select throws_ok($$ update public.session_addons set total = 1 $$, '42501', 'permission denied for table session_addons', 'vault-17: no role can update a session_addons row');
select throws_ok($$ delete from public.session_addons $$, '42501', 'permission denied for table session_addons', 'vault-17: no role can delete a session_addons row');
select throws_ok($$ update public.canteen_sales set total = 1 $$, '42501', 'permission denied for table canteen_sales', 'vault-17: no role can update a canteen_sales row');
select throws_ok($$ delete from public.canteen_sales $$, '42501', 'permission denied for table canteen_sales', 'vault-17: no role can delete a canteen_sales row');
select throws_ok($$ update public.sessions set status = 'closed' $$, '42501', 'permission denied for table sessions', 'vault-12: no direct session update path');
select throws_ok($$ delete from public.sessions $$, '42501', 'permission denied for table sessions', 'vault-17: no session delete path');
select throws_ok($$ update public.shifts set status = 'closed' $$, '42501', 'permission denied for table shifts', 'vault-13: no direct shift update path');
select throws_ok($$ delete from public.shifts $$, '42501', 'permission denied for table shifts', 'vault-17: no shift delete path');
select throws_ok($$ update public.audit_log set action = 'tampered' $$, '42501', 'permission denied for table audit_log', 'vault-17: no audit update path');
select throws_ok($$ delete from public.audit_log $$, '42501', 'permission denied for table audit_log', 'vault-17: no audit delete path');

reset role;
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"org_admin","org_id":"11000000-0000-0000-0000-000000000001","branch_id":null}}', true);
set local role authenticated;
select throws_ok($$ update public.session_addons set total = 1 $$, '42501', 'permission denied for table session_addons', 'vault-17: org_admin cannot update a ledger row');
select throws_ok($$ delete from public.audit_log $$, '42501', 'permission denied for table audit_log', 'vault-17: org_admin cannot delete audit history');

reset role;
select * from finish();
rollback;
