-- Phase 02 · Deliverable 7: room-status escalation is status-only and
-- idempotent. It never writes a money row.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.organizations (id, name)
values ('13000000-0000-0000-0000-000000000001', 'Escalation org');
insert into public.branches (id, org_id, name)
values ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'Escalation branch');
insert into public.staff (id, org_id, branch_id, email, role, display_name)
values ('33000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'cashier@example.test', 'cashier', 'Cashier');
insert into public.rooms (id, org_id, branch_id, room_number, status)
values
  ('43000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '301', 'occupied'),
  ('43000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '302', 'occupied');
insert into public.sessions (id, org_id, branch_id, room_id, cashier_id, booking_type, pax, checked_in_at, booked_end_at)
values
  ('53000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 'short_time', 2, now() - interval '4 hours', now() - interval '1 hour'),
  ('53000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', 'short_time', 2, now() - interval '4 hours 10 minutes', now() + interval '1 hour');

select is(app.escalate_room_statuses(), 1, 'vault-15: escalation advances one eligible room');
select is((select status from public.rooms where id = '43000000-0000-0000-0000-000000000001'), 'overdue'::text, 'vault-05: one hour past booked end is overdue');
select is((select status from public.rooms where id = '43000000-0000-0000-0000-000000000002'), 'occupied'::text, 'vault-05: session before booked end remains occupied');

create temporary table _before as
select r.id, r.status from public.rooms r order by r.id;
select is(app.escalate_room_statuses(), 0, 'vault-15: second consecutive run changes no room');
select is((select count(*) from (select r.id,r.status from public.rooms r except select b.id,b.status from _before b) differences), 0::bigint, 'vault-15: two runs leave identical room statuses');
select is((select count(*) from public.session_addons), 0::bigint, 'vault-15: escalation writes no add-on money rows');

select * from finish();
rollback;
