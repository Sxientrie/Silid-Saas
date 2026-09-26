-- Phase 05 - Definition of done, second sentence: "Replayed writes carry
-- idempotency keys; the server never stores a client-supplied authoritative
-- timestamp (asserted by test against the local stack)."
--
-- The desk half of that sentence is proven in the TypeScript battery (the
-- strict envelope, the fixed-width idempotency key, the clientMetadata
-- namespace). This suite proves the half that only a real Postgres can: a
-- write arriving from a desk - however late, and carrying whatever instant the
-- desk believed - is stamped by the SERVER, and cannot afterwards be amended
-- by a client.
--
-- Run against the linked project through the Supabase MCP path, because this
-- host has no Docker daemon and therefore no local stack. Every statement here
-- is inside `begin` / `rollback`, so the proof leaves no residue.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.organizations (id, name)
values ('15000000-0000-5000-8000-000000000001', 'Phase05 replay-seal org');
insert into public.branches (id, org_id, name)
values ('25000000-0000-5000-8000-000000000001', '15000000-0000-5000-8000-000000000001', 'Phase05 desk');
insert into public.staff (id, org_id, branch_id, email, role, display_name) values
  ('35000000-0000-5000-8000-000000000001', '15000000-0000-5000-8000-000000000001', '25000000-0000-5000-8000-000000000001', 'cashier@phase05.test', 'cashier', 'Cashier'),
  ('35000000-0000-5000-8000-000000000002', '15000000-0000-5000-8000-000000000001', null, 'orgadmin@phase05.test', 'org_admin', 'Org Admin');
insert into public.rooms (id, org_id, branch_id, room_number)
values ('45000000-0000-5000-8000-000000000001', '15000000-0000-5000-8000-000000000001', '25000000-0000-5000-8000-000000000001', '101');

-- ---------------------------------------------------------------------------
-- Structural: a client has nowhere to put a time, on any write path.
-- ---------------------------------------------------------------------------

-- First half of the property: no state-changing entry point even accepts a
-- timestamp. A desk cannot forge an instant it has no parameter to forge it
-- into, and this counts every public function that takes one.
select is((
  select count(*)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('close_session','close_shift','record_shift_count','void_session',
                      'update_rate_config','merge_rate_config','create_branch','deactivate_staff')
    and pg_get_function_arguments(p.oid) ~* 'timestamp'
), 0::bigint,
  'no state-changing public function accepts a timestamp parameter, so a desk has nowhere to supply one'
);

-- Second half: the fact tables are append-only for a client. A sealed instant
-- is written once, and there is no client UPDATE or DELETE with which to amend
-- it later. (organizations and staff are deliberately absent - they are
-- catalog and claim tables, not facts.)
select is((
  select count(*)
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated'
    and table_name in ('sessions','shifts','canteen_sales','session_addons','audit_log')
    and privilege_type in ('UPDATE','DELETE')
), 0::bigint,
  'authenticated holds no UPDATE or DELETE on any fact table, so a sealed instant cannot be amended'
);

-- The seal is not a per-table accident on the tables that matter, and the
-- exemption is named rather than implied: only the four catalog tables (whose
-- created_at is administrative, and which no replayed write ever targets) skip
-- it. Adding a new client-insertable table without a seal breaks this line.
select is((
  select coalesce(array_agg(c.relname::text order by c.relname), '{}'::text[])
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (
      select 1 from pg_policy p
      where p.polrelid = c.oid and p.polcmd = 'a'
        and exists (select 1 from pg_roles r where r.oid = any(p.polroles) and r.rolname = 'authenticated')
    )
    and not exists (
      select 1 from pg_trigger t
      where t.tgrelid = c.oid and not t.tgisinternal and (t.tgtype & 6) = 6
    )
),
  '{branches,organizations,rooms,staff}'::text[],
  'the only client-insertable tables without a BEFORE INSERT seal are the four catalog tables'
);

-- And the seals stamp a clock, not a copy of the row. clock_timestamp() is the
-- statement clock, so two writes in one transaction still get distinct instants
-- - which is what makes a replayed pair orderable at all.
select is((
  select count(*)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.proname like 'seal%'
    and p.prosrc like '%clock_timestamp()%'
), (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname like 'seal%')::bigint,
  'every seal trigger stamps clock_timestamp(), so instants are per-statement and orderable'
);

-- The one column with no default is the one a naive reading would call
-- client-settable: booked_end_at. It has no DEFAULT precisely because the
-- trigger must derive it from the server's own check-in instant rather than
-- take a client-supplied one - otherwise a desk could set the overstay deadline.
select is((
  select count(*)
  from pg_attribute
  where attrelid = 'public.sessions'::regclass and attname = 'booked_end_at'
    and not exists (select 1 from pg_attrdef d where d.adrelid = attrelid and d.adnum = attnum)
), 1::bigint,
  'sessions.booked_end_at carries no column default, so the trigger must derive it rather than the client supply it'
);

-- ---------------------------------------------------------------------------
-- Behavioural: a desk write carrying a forged instant, arriving late.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"35000000-0000-5000-8000-000000000001","role":"authenticated","app_metadata":{"role":"cashier","org_id":"15000000-0000-5000-8000-000000000001","branch_id":"25000000-0000-5000-8000-000000000001"}}', true);
select set_config('app.test.before_call', clock_timestamp()::text, true);
set local role authenticated;

-- A shift open, forged a decade into the past and attributed to somebody else:
-- the shape of a desk replaying an old outbox entry.
insert into public.shifts (id, org_id, branch_id, opened_by, opened_at)
values ('85000000-0000-5000-8000-000000000001', '15000000-0000-5000-8000-000000000001', '25000000-0000-5000-8000-000000000001', '35000000-0000-5000-8000-000000000002', '1999-01-01 00:00:00+00'::timestamptz);

select is((
  select opened_at >= current_setting('app.test.before_call')::timestamptz
  from public.shifts where id = '85000000-0000-5000-8000-000000000001'
), true,
  'a shift open replayed with a decade-old opened_at is stamped with the server clock'
);
select is((
  select opened_by from public.shifts where id = '85000000-0000-5000-8000-000000000001'
), '35000000-0000-5000-8000-000000000001'::uuid,
  'a shift open replayed with another user''s opened_by is attributed to the authenticated caller'
);

-- A check-in, forged a century into the future. This is the attack that matters
-- for the overstay ladder: a desk that back- or forward-dates a check-in moves
-- every deadline computed from it.
insert into public.sessions (id, org_id, branch_id, room_id, cashier_id, booking_type, pax, checked_in_at, booked_end_at)
values ('55000000-0000-5000-8000-000000000001', '15000000-0000-5000-8000-000000000001', '25000000-0000-5000-8000-000000000001', '45000000-0000-5000-8000-000000000001', '35000000-0000-5000-8000-000000000001', 'short_time', 2, '2099-01-01 00:00:00+00'::timestamptz, '2099-01-01 03:00:00+00'::timestamptz);

select is((
  select checked_in_at >= current_setting('app.test.before_call')::timestamptz
  from public.sessions where id = '55000000-0000-5000-8000-000000000001'
), true,
  'a check-in replayed with a future-dated checked_in_at is stamped with the server clock'
);
select is((
  select checked_in_at < now() + interval '1 minute'
  from public.sessions where id = '55000000-0000-5000-8000-000000000001'
), true,
  'the forged future instant is discarded, not merely bounded'
);
select is((
  select booked_end_at = checked_in_at + interval '3 hours'
  from public.sessions where id = '55000000-0000-5000-8000-000000000001'
), true,
  'the overstay deadline is derived from the server instant, so a desk cannot move it'
);

-- The audit row a replay produces: forged time, forged actor.
insert into public.audit_log (id, org_id, branch_id, actor_id, action, target_table, target_id, ts)
values ('95000000-0000-5000-8000-000000000001', '15000000-0000-5000-8000-000000000001', '25000000-0000-5000-8000-000000000001', '35000000-0000-5000-8000-000000000002', 'shift.open', 'shifts', '85000000-0000-5000-8000-000000000001', '1999-01-01 00:00:00+00'::timestamptz);

-- The two money-adjacent ledgers, same shape.
insert into public.canteen_sales (id, org_id, branch_id, item, qty, unit_price, total, cashier_id, sold_at)
values ('65000000-0000-5000-8000-000000000001', '15000000-0000-5000-8000-000000000001', '25000000-0000-5000-8000-000000000001', 'bottled_water', 1, 999, 999, '35000000-0000-5000-8000-000000000001', '1999-01-01 00:00:00+00'::timestamptz);
select is((
  select sold_at >= current_setting('app.test.before_call')::timestamptz
  from public.canteen_sales where id = '65000000-0000-5000-8000-000000000001'
), true,
  'a replayed canteen sale carrying a forged sold_at is stamped with the server clock'
);

insert into public.session_addons (id, org_id, branch_id, session_id, item, qty, unit_price, total, cashier_id, added_at)
values ('75000000-0000-5000-8000-000000000001', '15000000-0000-5000-8000-000000000001', '25000000-0000-5000-8000-000000000001', '55000000-0000-5000-8000-000000000001', 'pillow', 1, 999, 999, '35000000-0000-5000-8000-000000000001', '1999-01-01 00:00:00+00'::timestamptz);
select is((
  select added_at >= current_setting('app.test.before_call')::timestamptz
  from public.session_addons where id = '75000000-0000-5000-8000-000000000001'
), true,
  'a replayed guest add-on carrying a forged added_at is stamped with the server clock'
);

-- A cashier may append to the audit ledger but not read it: the SELECT policy
-- admits only platform and org admins. Read back as the client first, so the
-- refusal is proven from the client's own point of view.
select is((
  select count(*) from public.audit_log
), 0::bigint,
  'a cashier can append an audit row but cannot read the ledger back'
);

-- Reading what was actually stored needs a role that may read the ledger. The
-- assertion is about storage, not about who gets to see it.
reset role;
select is((
  select ts >= current_setting('app.test.before_call')::timestamptz
  from public.audit_log where id = '95000000-0000-5000-8000-000000000001'
), true,
  'a replayed audit row carrying a forged ts is stamped with the server clock'
);
select is((
  select actor_id from public.audit_log where id = '95000000-0000-5000-8000-000000000001'
), '35000000-0000-5000-8000-000000000001'::uuid,
  'a replayed audit row carrying another user''s actor_id is attributed to the authenticated caller'
);

-- The second attack, and the one a seal alone would not stop: the replay
-- arrives, and a LATER request tries to correct the stored instant.
set local role authenticated;
select throws_ok($$
  update public.sessions set checked_in_at = '1999-01-01 00:00:00+00'::timestamptz
  where id = '55000000-0000-5000-8000-000000000001'
$$, '42501', 'permission denied for table sessions',
  'a client cannot amend a server-stamped check-in instant afterwards'
);
select is((
  select checked_in_at >= current_setting('app.test.before_call')::timestamptz
  from public.sessions where id = '55000000-0000-5000-8000-000000000001'
), true,
  'the server-stamped instant is still the stored instant after the amendment was refused'
);
select is((
  select count(*) from public.sessions
), 1::bigint,
  'the refused amendment created nothing'
);

reset role;
select * from finish();
rollback;
