-- Phase 02 · ATTACK BATTERY (review gate): authored fresh from the phase's
-- acceptance inputs and the spec set; attacks the live database behavior.
-- One behavior per assertion; everything rolls back. Fixture namespace 9a…
-- cannot collide with anything.

begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- ── fixtures (trusted path: no claims set yet) ────────────────────────────
insert into public.organizations (id, name) values
  ('9a100000-0000-0000-0000-000000000001', 'Attack org A'),
  ('9a100000-0000-0000-0000-000000000002', 'Attack org B');
insert into public.branches (id, org_id, name) values
  ('9a200000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', 'A1'),
  ('9a200000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', 'A2'),
  ('9a200000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', 'B1');
insert into public.staff (id, org_id, branch_id, email, role, display_name) values
  ('9a300000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000001', 'a1@attack.test', 'cashier', 'A1 cashier'),
  ('9a300000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000002', 'a2@attack.test', 'cashier', 'A2 cashier'),
  ('9a300000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', '9a200000-0000-0000-0000-000000000003', 'b1@attack.test', 'cashier', 'B1 cashier'),
  ('9a300000-0000-0000-0000-000000000004', '9a100000-0000-0000-0000-000000000001', null, 'admin-a@attack.test', 'org_admin', 'Org A admin'),
  ('9a300000-0000-0000-0000-000000000005', '9a100000-0000-0000-0000-000000000002', null, 'admin-b@attack.test', 'org_admin', 'Org B admin'),
  -- staff rows exist only for tenant roles (data-model §1; the Phase 03
  -- corrective pass made it a table constraint): this fixture row carries a
  -- tenant role — no assertion reads the row, and the platform claims below
  -- require no staff row by design.
  ('9a300000-0000-0000-0000-000000000006', '9a100000-0000-0000-0000-000000000002', null, 'platform@attack.test', 'org_admin', 'Org B admin 2');
insert into public.rooms (id, org_id, branch_id, room_number) values
  ('9a400000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000001', 'X1'),
  ('9a400000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000002', 'X2'),
  ('9a400000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', '9a200000-0000-0000-0000-000000000003', 'Y1');
insert into public.shifts (id, org_id, branch_id, opened_by, opened_at) values
  ('9a800000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000001', '9a300000-0000-0000-0000-000000000001', now() - interval '1 day'),
  ('9a800000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000002', '9a300000-0000-0000-0000-000000000002', now() - interval '1 day'),
  ('9a800000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', '9a200000-0000-0000-0000-000000000003', '9a300000-0000-0000-0000-000000000003', now() - interval '1 day');
insert into public.sessions (id, org_id, branch_id, room_id, cashier_id, booking_type, pax, checked_in_at, booked_end_at, status) values
  ('9a500000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000001', '9a400000-0000-0000-0000-000000000001', '9a300000-0000-0000-0000-000000000001', 'short_time', 2, now() - interval '2 hours', now() - interval '1 hour', 'active'),
  ('9a500000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000002', '9a400000-0000-0000-0000-000000000002', '9a300000-0000-0000-0000-000000000002', 'short_time', 2, now() - interval '2 hours', now() + interval '1 hour', 'active'),
  ('9a500000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', '9a200000-0000-0000-0000-000000000003', '9a400000-0000-0000-0000-000000000003', '9a300000-0000-0000-0000-000000000003', 'short_time', 2, now() - interval '2 hours', now() + interval '1 hour', 'closed'),
  ('9a500000-0000-0000-0000-000000000006', '9a100000-0000-0000-0000-000000000002', '9a200000-0000-0000-0000-000000000003', '9a400000-0000-0000-0000-000000000003', '9a300000-0000-0000-0000-000000000003', 'short_time', 2, now() - interval '2 hours', now() + interval '1 hour', 'active');
-- A closed shift opened by the OTHER branch's cashier, for the non-opener count attack.
insert into public.shifts (id, org_id, branch_id, opened_by, opened_at, closed_by, closed_at, status) values
  ('9a800000-0000-0000-0000-000000000004', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000001', '9a300000-0000-0000-0000-000000000002', now() - interval '2 days', '9a300000-0000-0000-0000-000000000002', now() - interval '1 day', 'closed');

-- ── input 1/2 + invariant 1: cross-tenant reads by every tier ─────────────
select set_config('request.jwt.claims', 'null', true);
set local role anon;
select throws_ok($$ select count(*) from public.sessions $$, '42501', null,
  'attack anon-1: anon role cannot read session ledgers');
select throws_ok($$ select public.close_session('9a500000-0000-0000-0000-000000000001') $$, '42501', null,
  'attack anon-2: anon cannot invoke the checkout RPC');
reset role;
set local role service_role;
select throws_ok($$ select count(*) from public.sessions $$, '42501', null,
  'attack svc-1: service_role has no direct ledger read');
reset role;

select set_config('request.jwt.claims', '{"sub":"9a300000-0000-0000-0000-000000000005","role":"authenticated","app_metadata":{"role":"org_admin","org_id":"9a100000-0000-0000-0000-000000000002","branch_id":null}}', true);
set local role authenticated;
select is((select count(*) from public.sessions), 2::bigint,
  'attack iso-1: organization B admin sees only its own sessions (closed and active alike)');
select is((select count(*) from public.rooms), 1::bigint,
  'attack iso-2: organization B admin cannot read organization A rooms');
select is((select count(*) from public.audit_log), 0::bigint,
  'attack iso-3: organization B admin cannot review organization A audit');
select throws_ok($$ select app.void_session('9a500000-0000-0000-0000-000000000001', 'forged void') $$,
  '42501', 'session is outside caller organization',
  'attack rpc-3: an organization B admin cannot void an organization A session');

-- ── input 4 + invariant 2a/2d: forged client inserts ──────────────────────
select set_config('request.jwt.claims', '{"sub":"9a300000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"cashier","org_id":"9a100000-0000-0000-0000-000000000001","branch_id":"9a200000-0000-0000-0000-000000000001"}}', true);
select throws_ok($$
  insert into public.sessions (id, org_id, branch_id, room_id, cashier_id, booking_type, pax, checked_in_at, booked_end_at)
  values ('9a500000-0000-0000-0000-000000000004', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000001', '9a400000-0000-0000-0000-000000000001', '9a300000-0000-0000-0000-000000000002', 'short_time', 2, '1900-01-01', '1901-01-01')
$$, '42501', 'cashier claim does not own this check-in',
  'attack attr-1: a cashier cannot check in under another cashier''s name');
select throws_ok($$
  insert into public.sessions (id, org_id, branch_id, room_id, cashier_id, booking_type, pax, checked_in_at, booked_end_at)
  values ('9a500000-0000-0000-0000-000000000005', '9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000001', '9a400000-0000-0000-0000-000000000001', '9a300000-0000-0000-0000-000000000001', 'short_time', 0, '1900-01-01', '1901-01-01')
$$, '23514', null,
  'attack money-1: zero-pax sessions are refused by the schema');

-- ── inputs 7/9 + invariant 2c: forged line items ──────────────────────────
select throws_ok($$
  insert into public.canteen_sales (org_id, branch_id, session_id, item, qty, unit_price, total, cashier_id)
  values ('9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000001', '9a500000-0000-0000-0000-000000000003', 'bottled_water', 1, 1, 1, '9a300000-0000-0000-0000-000000000001')
$$, '23514', null,
  'attack money-2: a canteen sale cannot attach to a closed or foreign-org session');
select throws_ok($$
  insert into public.session_addons (org_id, branch_id, session_id, item, qty, unit_price, total, cashier_id)
  values ('9a100000-0000-0000-0000-000000000001', '9a200000-0000-0000-0000-000000000001', '9a500000-0000-0000-0000-000000000002', 'pillow', 1, 1, 1, '9a300000-0000-0000-0000-000000000001')
$$, '23514', null,
  'attack iso-4: an add-on cannot attach to a session outside the cashier branch');

-- ── inputs 8/10 + invariant 2b: forged RPC calls ──────────────────────────
select throws_ok($$ select app.close_session('9a500000-0000-0000-0000-000000000002', now()) $$,
  '42501', 'session is outside caller scope',
  'attack rpc-1: a cashier cannot check out a sibling-branch session');
select throws_ok($$ select app.close_session('9a500000-0000-0000-0000-000000000006', now()) $$,
  '42501', 'session is outside caller scope',
  'attack rpc-2: a cashier cannot check out another organization''s active session');
select throws_ok($$ select app.close_shift('9a800000-0000-0000-0000-000000000002', now(), null) $$,
  '42501', 'shift is outside caller scope',
  'attack rpc-4: a cashier cannot close a sibling-branch shift');
select throws_ok($$ select app.record_shift_count('9a800000-0000-0000-0000-000000000004', 100) $$,
  '42501', 'count requires org_admin or shift opener',
  'attack rpc-5: a same-branch non-opener cashier cannot record the count');
select throws_ok($$ select app.record_shift_count('9a800000-0000-0000-0000-000000000001', -100) $$,
  '22023', 'counted_total must be zero or positive',
  'attack money-3: a negative physical count is refused');

-- trusted path for the close_shift negative-count attack (org A shift 9a8…002 is open)
-- money-4 keeps the cashier claims: the guard fires before the scope check.
select throws_ok($$ select app.close_shift('9a800000-0000-0000-0000-000000000002', now(), -100) $$,
  '22023', 'counted_total must be zero or positive',
  'attack money-4: a negative counted total is refused at close');
reset role;

-- ── input 11 + invariant 3: escalation and platform-tier ledgers ──────────
select set_config('request.jwt.claims', '{"sub":"9a300000-0000-0000-0000-000000000006","role":"authenticated","app_metadata":{"role":"platform_admin","org_id":null,"branch_id":null}}', true);
set local role authenticated;
select throws_ok($$ update public.sessions set status = 'closed' $$, '42501', null,
  'attack append-1: even platform_admin cannot update a session row');
select throws_ok($$ delete from public.audit_log $$, '42501', null,
  'attack append-2: even platform_admin cannot delete audit history');
reset role;

-- ── input 10 (rate merge) + vault-07: cross-org merge and garbage configs ─
select set_config('request.jwt.claims', '{"sub":"9a300000-0000-0000-0000-000000000005","role":"authenticated","app_metadata":{"role":"org_admin","org_id":"9a100000-0000-0000-0000-000000000002","branch_id":null}}', true);
set local role authenticated;
select throws_ok($$ select public.merge_rate_config('9a200000-0000-0000-0000-000000000001', '{}'::jsonb, '{}'::jsonb) $$,
  'P0002', 'branch not found',
  'attack rpc-6: an organization B admin cannot even see an organization A branch through the merge path');
reset role;

-- zero-grace and garbage parameter configs fall back silently (trusted)
update public.branches set rate_config = jsonb_set(rate_config, '{extension,grace_minutes}', '0') where id = '9a200000-0000-0000-0000-000000000001';
select is(app.extension_blocks_due('9a200000-0000-0000-0000-000000000001', now(), now()), 0,
  'attack money-5: zero grace is overdue with zero blocks exactly at booked end');
select is(app.extension_blocks_due('9a200000-0000-0000-0000-000000000001', now(), now() + interval '1 minute'), 1,
  'attack money-6: with zero grace the first block starts one minute past booked end');
update public.branches set rate_config = jsonb_set(jsonb_set(jsonb_set(rate_config, '{extension,grace_minutes}', '"abc"'), '{extension,block_minutes}', '"0"'), '{extension,block_charge}', '"-5"') where id = '9a200000-0000-0000-0000-000000000001';
select is(app.extension_blocks_due('9a200000-0000-0000-0000-000000000001', now() - interval '1 hour', now() - interval '1 hour' + interval '26 minutes'), 1,
  'attack money-7: garbage per-branch parameters fall back to the 25/60/150 defaults');

reset role;
select * from finish();
rollback;
