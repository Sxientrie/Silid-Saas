-- /Silid/supabase/tests/11_attack_battery_phase03_test.sql
-- PHASE 03 ATTACK BATTERY (adversarial sub-agent; authored from the specs,
-- the invariants and the acceptance inputs only — implementation and
-- migrations unread). Single transaction; fixtures use fixed UUIDs that
-- cannot collide with real rows; the whole suite rolls back.
--
-- HARNESS NOTE: this host has no Docker, so `supabase db test` cannot run
-- here, and the Management-API execute path (`supabase db query --linked`)
-- prints only the LAST statement's result set. The suite therefore buffers
-- every pgTAP assertion line into a temp table and emits the complete TAP
-- log from the final SELECT — one result set, readable through either
-- harness. The assertions themselves are stock pgTAP calls, executed once
-- each, in order, inside one plpgsql runner.
--
-- Claims attacked (roadmap 03 acceptance inputs):
--   1. operator creates an organization            -> G2 (only platform tier may)
--   2. operator sets active/suspended              -> G3 (status is platform-managed)
--   3. operator adds branches                      -> G4 (cross-org + lower tiers refused)
--   4. operator provisions an org-admin            -> G6/G8 (server-path discipline)
--   5. org admin sees/manages only own org         -> G5 (org + DB path; sibling branch)
--   6. staff provisioned only via server path;     -> G1/G6 (forged/mismatched claims,
--      client cannot set own claims                   platform_admin staff-row discipline)
--   7. deactivation ends access with token in hand -> G8 (stale token stops acting)
--   8. no authorization decision trusts user-      -> G1 (user_metadata forgery), G7
--      editable metadata                              (audit tampering incl. platform)
--
-- Run:
--   pnpm exec supabase db query --linked --file supabase/tests/11_attack_battery_phase03_test.sql

begin;
set local search_path = extensions, public, app;

create temp table tap_log (rn int generated always as identity, line text) on commit drop;
grant insert on pg_temp.tap_log to anon, authenticated;
grant select on pg_temp.tap_log to anon, authenticated;

-- runs an UPDATE as the CURRENT role/claims and returns its affected-row
-- count (-1 if the statement was refused with an error). Invoker rights.
create function pg_temp.upd_count(p_sql text) returns bigint
language plpgsql as $$
declare
  v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v;
exception when others then
  return -1;
end $$;

create function pg_temp.act(p_sub uuid, p_role text, p_org uuid default null, p_branch uuid default null)
returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_sub::text,
      'role', 'authenticated',
      'app_metadata', json_build_object(
        'role', p_role,
        'org_id', p_org,
        'branch_id', p_branch
      )
    )::text,
    true
  );
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (session role = postgres, bypasses RLS). Fixed UUIDs:
--   ORG_A  a77aaa01-0000-4000-8000-0000000000a1   (tenant A)
--   ORG_B  a77aaa02-0000-4000-8000-0000000000b2   (tenant B)
--   BR_A1  a77bbb11-0000-4000-8000-0000000000a1   (branch of A)
--   BR_A2  a77bbb22-0000-4000-8000-0000000000a2   (sibling branch of A)
--   BR_B1  a77bbb33-0000-4000-8000-0000000000b1   (branch of B)
--   ADM_A  a77ccc11-0000-4000-8000-0000000000a1   (org_admin of A)
--   CSH_A1 a77ccc22-0000-4000-8000-0000000000a2   (cashier of A at BR_A1)
--   ADM_B  a77ccc33-0000-4000-8000-0000000000b3   (org_admin of B)
--   PHNTM  a77fff99-0000-4000-8000-00000000ffff   (auth-like id with NO staff row)
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name) values
  ('a77aaa01-0000-4000-8000-0000000000a1', 'ATTACK-ORG-A'),
  ('a77aaa02-0000-4000-8000-0000000000b2', 'ATTACK-ORG-B');

insert into public.branches (id, org_id, name) values
  ('a77bbb11-0000-4000-8000-0000000000a1', 'a77aaa01-0000-4000-8000-0000000000a1', 'ATTACK-BR-A1'),
  ('a77bbb22-0000-4000-8000-0000000000a2', 'a77aaa01-0000-4000-8000-0000000000a1', 'ATTACK-BR-A2'),
  ('a77bbb33-0000-4000-8000-0000000000b1', 'a77aaa02-0000-4000-8000-0000000000b2', 'ATTACK-BR-B1');

insert into public.staff (id, org_id, branch_id, email, role, display_name) values
  ('a77ccc11-0000-4000-8000-0000000000a1', 'a77aaa01-0000-4000-8000-0000000000a1', null, 'attack-adm-a@attack.invalid', 'org_admin', 'Attack Admin A'),
  ('a77ccc22-0000-4000-8000-0000000000a2', 'a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb11-0000-4000-8000-0000000000a1', 'attack-csh-a1@attack.invalid', 'cashier', 'Attack Cashier A1'),
  ('a77ccc33-0000-4000-8000-0000000000b3', 'a77aaa02-0000-4000-8000-0000000000b2', null, 'attack-adm-b@attack.invalid', 'org_admin', 'Attack Admin B');

-- audit rows in both orgs (inserted without a jwt: the seal trigger keeps values)
insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id) values
  ('a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb11-0000-4000-8000-0000000000a1', 'a77ccc11-0000-4000-8000-0000000000a1', 'attack_fixture_a', 'staff', 'a77ccc11-0000-4000-8000-0000000000a1'),
  ('a77aaa02-0000-4000-8000-0000000000b2', 'a77bbb33-0000-4000-8000-0000000000b1', 'a77ccc33-0000-4000-8000-0000000000b3', 'attack_fixture_b', 'staff', 'a77ccc33-0000-4000-8000-0000000000b3');

-- ---------------------------------------------------------------------------
-- Assertion runner: every pgTAP call stays a single behavior, in order.
-- ---------------------------------------------------------------------------
do $suite$
begin
  insert into tap_log (line) select extensions.plan(57);

  execute 'set local role authenticated';

  -- =======================================================================
  -- G1. FORGED / MISMATCHED CLAIMS AT THE POLICY BOUNDARY
  -- =======================================================================

  -- T1: org_admin claims whose sub has NO staff row -> sees zero organizations
  perform pg_temp.act('a77fff99-0000-4000-8000-00000000ffff', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.organizations where id = 'a77aaa02-0000-4000-8000-0000000000b2'),
      0::bigint, 'T1 attack: org_admin claim for an id with no staff row sees zero org rows');

  -- T2: same forged claims cannot create a branch
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$insert into public.branches (id, org_id, name)
       values ('a77bbb66-0000-4000-8000-0000000000b6', 'a77aaa01-0000-4000-8000-0000000000a1', 'ATTACK-BR-FORGED')$t$,
      '42501', null::text, 'T2 attack: forged org_admin claim (no staff row) refused on branches insert');

  -- T3: org_admin claim stamped onto a CASHIER profile (role mismatch) -> zero orgs
  perform pg_temp.act('a77ccc22-0000-4000-8000-0000000000a2', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.organizations),
      0::bigint, 'T3 attack: org_admin claim over a cashier profile sees zero org rows');

  -- T4: user_metadata carries the role/org (the classic client-side forgery) -> trusted by nothing
  perform set_config(
    'request.jwt.claims',
    '{"sub":"a77ccc22-0000-4000-8000-0000000000a2","role":"authenticated","app_metadata":{},"user_metadata":{"role":"org_admin","org_id":"a77aaa01-0000-4000-8000-0000000000a1"}}',
    true);
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.organizations),
      0::bigint, 'T4 attack: user_metadata role/org forgery sees zero org rows (no policy reads user_metadata)');

  -- T5: same user_metadata forgery cannot insert a staff row
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$insert into public.staff (id, org_id, email, role, display_name)
       values ('a77ccc55-0000-4000-8000-0000000000a5', 'a77aaa01-0000-4000-8000-0000000000a1', 'attack-forged@attack.invalid', 'cashier', 'Forged Row')$t$,
      '42501', null::text, 'T5 attack: user_metadata forgery refused on staff insert');

  -- T6: cashier claims naming a SIBLING branch -> zero sibling-branch rows
  perform pg_temp.act('a77ccc22-0000-4000-8000-0000000000a2', 'cashier', 'a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb22-0000-4000-8000-0000000000a2');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.branches where id = 'a77bbb22-0000-4000-8000-0000000000a2'),
      0::bigint, 'T6 attack: cashier claim with sibling-branch branch_id sees zero sibling rows');

  -- T7: same forged sibling claim sees no other staff row
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.staff where id = 'a77ccc11-0000-4000-8000-0000000000a1'),
      0::bigint, 'T7 attack: cashier claim with sibling branch sees no other staff row');

  -- T8 (informational, by design): platform_admin claims are signed-claim trusted;
  -- the DB cannot distinguish them from a token the server actually issued. The
  -- client-reachable guard (clients cannot SET app_metadata) is proven in the
  -- Node battery under packages/auth/test/attack.*.
  perform pg_temp.act('a77fff99-0000-4000-8000-00000000ffff', 'platform_admin');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.organizations),
      2::bigint, 'T8 informational: signed platform claims reach all orgs by design (client cannot mint these claims)');

  -- T9: platform_admin claim with org_id set violates the claim shape -> trusted by nothing
  perform pg_temp.act('a77fff99-0000-4000-8000-00000000ffff', 'platform_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.organizations),
      0::bigint, 'T9 attack: platform_admin claim carrying org_id sees zero org rows');

  -- T10: org_admin claim carrying a branch_id violates the claim shape -> trusted by nothing
  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb11-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.organizations),
      0::bigint, 'T10 attack: org_admin claim carrying branch_id sees zero org rows');

  -- =======================================================================
  -- G2. ORGANIZATION CREATION (claim 1)
  -- =======================================================================
  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$insert into public.organizations (id, name)
       values ('a77aaa03-0000-4000-8000-0000000000c3', 'ATTACK-ORG-C3')$t$,
      '42501', null::text, 'T11 attack: org_admin cannot create an organization');

  perform pg_temp.act('a77ccc22-0000-4000-8000-0000000000a2', 'cashier', 'a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb11-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$insert into public.organizations (id, name)
       values ('a77aaa04-0000-4000-8000-0000000000c4', 'ATTACK-ORG-C4')$t$,
      '42501', null::text, 'T12 attack: cashier cannot create an organization');

  execute 'set local role anon';
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$insert into public.organizations (id, name)
       values ('a77aaa05-0000-4000-8000-0000000000c5', 'ATTACK-ORG-C5')$t$,
      '42501', null::text, 'T13 attack: anon cannot create an organization');
  execute 'set local role authenticated';

  -- the sanctioned path still works (refusals above are not a dead table)
  perform pg_temp.act('a77fff99-0000-4000-8000-00000000ffff', 'platform_admin');
  insert into tap_log (line)
    select extensions.lives_ok(
      $t$insert into public.organizations (id, name)
       values ('a77aaa06-0000-4000-8000-0000000000c6', 'ATTACK-ORG-C6')$t$,
      'T14 control: platform tier creates an organization');

  -- =======================================================================
  -- G3. ORGANIZATION STATUS (claim 2: active/suspended is platform-managed)
  -- =======================================================================
  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.is(
      pg_temp.upd_count($u$update public.organizations set status = 'suspended' where id = 'a77aaa02-0000-4000-8000-0000000000b2'$u$),
      0::bigint, 'T15 attack: org_admin cannot suspend another organization');
  insert into tap_log (line)
    select extensions.is(
      pg_temp.upd_count($u$update public.organizations set status = 'suspended' where id = 'a77aaa01-0000-4000-8000-0000000000a1'$u$),
      0::bigint, 'T16 attack: org_admin cannot suspend even its own organization');
  perform pg_temp.act('a77ccc22-0000-4000-8000-0000000000a2', 'cashier', 'a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb11-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.is(
      pg_temp.upd_count($u$update public.organizations set status = 'suspended' where id = 'a77aaa01-0000-4000-8000-0000000000a1'$u$),
      0::bigint, 'T17 attack: cashier cannot touch organization status');
  perform pg_temp.act('a77fff99-0000-4000-8000-00000000ffff', 'platform_admin');
  insert into tap_log (line)
    select extensions.is(
      pg_temp.upd_count($u$update public.organizations set status = 'suspended' where id = 'a77aaa01-0000-4000-8000-0000000000a1'$u$),
      1::bigint, 'T18 control: platform tier sets organization status');
  insert into tap_log (line)
    select extensions.is(
      (select status from public.organizations where id = 'a77aaa01-0000-4000-8000-0000000000a1'),
      'suspended', 'T19 control: the status change took effect');

  -- =======================================================================
  -- G4. BRANCHES (claim 3)
  -- =======================================================================
  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$insert into public.branches (id, org_id, name)
       values ('a77bbb77-0000-4000-8000-0000000000b7', 'a77aaa02-0000-4000-8000-0000000000b2', 'ATTACK-BR-B2')$t$,
      '42501', null::text, 'T20 attack: org_admin cannot add a branch to another organization');
  perform pg_temp.act('a77ccc22-0000-4000-8000-0000000000a2', 'cashier', 'a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb11-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$insert into public.branches (id, org_id, name)
       values ('a77bbb88-0000-4000-8000-0000000000b8', 'a77aaa01-0000-4000-8000-0000000000a1', 'ATTACK-BR-A4')$t$,
      '42501', null::text, 'T21 attack: cashier cannot add branches');

  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.lives_ok(
      $t$insert into public.branches (id, org_id, name)
       values ('a77bbb44-0000-4000-8000-0000000000a3', 'a77aaa01-0000-4000-8000-0000000000a1', 'ATTACK-BR-A3')$t$,
      'T22 control: org_admin manages its own organization branch structure');
  insert into tap_log (line)
    select extensions.is(
      pg_temp.upd_count($u$update public.branches set name = 'HIJACKED' where id = 'a77bbb33-0000-4000-8000-0000000000b1'$u$),
      0::bigint, 'T23 attack: org_admin cannot update another organization''s branch');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$delete from public.branches where id = 'a77bbb11-0000-4000-8000-0000000000a1'$t$,
      '42501', null::text, 'T24 attack: branch rows have no delete path');

  -- ===========================================================================
  -- G5. CROSS-ORGANIZATION VISIBILITY (claim 5: only own org, UI == DB path)
  -- ===========================================================================
  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.organizations),
      1::bigint, 'T25 attack: org_admin A sees exactly one organization (its own)');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.branches where org_id = 'a77aaa02-0000-4000-8000-0000000000b2'),
      0::bigint, 'T26 attack: org_admin A sees zero branches of organization B');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.staff where org_id = 'a77aaa02-0000-4000-8000-0000000000b2'),
      0::bigint, 'T27 attack: org_admin A sees zero staff of organization B');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.audit_log where org_id = 'a77aaa02-0000-4000-8000-0000000000b2'),
      0::bigint, 'T28 attack: org_admin A sees zero audit rows of organization B');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$select app.deactivate_staff('a77ccc33-0000-4000-8000-0000000000b3')$t$,
      '42501', null::text, 'T29 attack: org_admin A cannot deactivate organization B staff via the RPC');
  perform pg_temp.act('a77ccc22-0000-4000-8000-0000000000a2', 'cashier', 'a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb11-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.audit_log),
      0::bigint, 'T30 attack: cashier tier sees zero audit rows (no audit review below org tier)');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.staff),
      1::bigint, 'T31 attack: cashier sees only its own staff row');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.branches),
      1::bigint, 'T32 attack: cashier sees only its own branch row (sibling branch invisible)');

  -- =======================================================================
  -- G6. STAFF PROVISIONING DISCIPLINE (claim 6)
  -- =======================================================================
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$insert into public.staff (id, org_id, email, role, display_name)
       values ('a77ccc44-0000-4000-8000-0000000000a4', 'a77aaa01-0000-4000-8000-0000000000a1', 'attack-x@attack.invalid', 'cashier', 'X')$t$,
      '42501', null::text, 'T33 attack: cashier cannot insert staff rows');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$insert into public.staff (id, org_id, email, role, display_name)
       values ('a77ccc66-0000-4000-8000-0000000000a6', 'a77aaa02-0000-4000-8000-0000000000b2', 'attack-y@attack.invalid', 'cashier', 'Y')$t$,
      '42501', null::text, 'T34 attack: org_admin cannot insert staff rows into another organization');

  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$insert into public.staff (id, org_id, email, role, display_name)
       values ('a77ccc77-0000-4000-8000-0000000000a7', 'a77aaa01-0000-4000-8000-0000000000a1', 'attack-pa@attack.invalid', 'platform_admin', 'Fake Platform')$t$,
      '42501', null::text, 'T35 attack: staff rows exist only for tenant roles (platform_admin staff row refused)');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.staff where role = 'platform_admin'),
      0::bigint, 'T36 attack: no platform_admin staff row exists after the insert attempt');
  insert into tap_log (line)
    select extensions.is(
      pg_temp.upd_count($u$update public.staff set role = 'platform_admin' where id = 'a77ccc11-0000-4000-8000-0000000000a1'$u$),
      0::bigint, 'T37 attack: org_admin cannot rewrite its own staff row into a platform_admin row');

  -- repair the fixture if T35/T37 left rows mutated, so later groups stay valid
  execute 'reset role';
  update public.staff set role = 'org_admin' where id = 'a77ccc11-0000-4000-8000-0000000000a1';
  delete from public.staff where role = 'platform_admin';
  execute 'set local role authenticated';

  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$update public.staff set org_id = 'a77aaa02-0000-4000-8000-0000000000b2' where id = 'a77ccc11-0000-4000-8000-0000000000a1'$t$,
      '42501', null::text, 'T38 attack: staff attribution (org_id) is not reassignable');

  -- =======================================================================
  -- G7. AUDIT-TRAIL TAMPERING (invariant 3: append-only for EVERY role)
  -- =======================================================================
  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$update public.audit_log set action = 'tampered' where org_id = 'a77aaa01-0000-4000-8000-0000000000a1'$t$,
      '42501', null::text, 'T39 attack: org_admin cannot update audit rows');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$delete from public.audit_log where org_id = 'a77aaa01-0000-4000-8000-0000000000a1'$t$,
      '42501', null::text, 'T40 attack: org_admin cannot delete audit rows');
  insert into tap_log (line)
    select extensions.lives_ok(
      $t$insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id)
       values ('a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb11-0000-4000-8000-0000000000a1', 'a77ccc33-0000-4000-8000-0000000000b3', 'forged_actor_attempt', 'staff', 'a77ccc33-0000-4000-8000-0000000000b3')$t$,
      'T41 attack: forged-actor audit insert is neutralized by the seal, not waved through');
  insert into tap_log (line)
    select extensions.is(
      (select actor_id from public.audit_log where action = 'forged_actor_attempt'),
      'a77ccc11-0000-4000-8000-0000000000a1', 'T41b control: the sealed row''s actor is the TRUE caller, not the forged one');
  insert into tap_log (line)
    select extensions.lives_ok(
      $t$insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id)
       values (null, null, 'a77ccc11-0000-4000-8000-0000000000a1', 'forge_platform_attribution', 'staff', 'a77ccc11-0000-4000-8000-0000000000a1')$t$,
      'T42 attack: null-attribution (platform-style) audit insert attempt is neutralized');
  insert into tap_log (line)
    select extensions.is(
      (select org_id from public.audit_log where action = 'forge_platform_attribution'),
      'a77aaa01-0000-4000-8000-0000000000a1', 'T42b control: the sealed row carries the CALLER''S org, not platform null attribution');

  perform pg_temp.act('a77fff99-0000-4000-8000-00000000ffff', 'platform_admin');
  insert into tap_log (line)
    select extensions.lives_ok(
      $t$insert into public.audit_log (org_id, branch_id, actor_id, action, target_table, target_id)
       values (null, null, 'a77fff99-0000-4000-8000-00000000ffff', 'platform_action_fixture', 'organizations', 'a77aaa06-0000-4000-8000-0000000000c6')$t$,
      'T43 control: platform-tier audit rows carry null org/branch attribution');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$update public.audit_log set action = 'tampered-by-platform' where org_id = 'a77aaa01-0000-4000-8000-0000000000a1'$t$,
      '42501', null::text, 'T44 attack: even the platform tier cannot update audit rows');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$delete from public.audit_log where org_id = 'a77aaa01-0000-4000-8000-0000000000a1'$t$,
      '42501', null::text, 'T45 attack: even the platform tier cannot delete audit rows');

  -- =======================================================================
  -- G8. DEACTIVATION (claim 7: token in hand stops acting; sessions revoked)
  -- =======================================================================
  perform pg_temp.act('a77ccc22-0000-4000-8000-0000000000a2', 'cashier', 'a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb11-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.branches where id = 'a77bbb11-0000-4000-8000-0000000000a1'),
      1::bigint, 'T46 baseline: the active cashier''s claims act on the database');
  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.lives_ok(
      $t$select app.deactivate_staff('a77ccc22-0000-4000-8000-0000000000a2')$t$,
      'T47 control: org_admin deactivates its own cashier through the sanctioned RPC');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.audit_log where action = 'deactivate_staff' and target_id = 'a77ccc22-0000-4000-8000-0000000000a2'),
      1::bigint, 'T47b control: the deactivation wrote its audit row');

  -- the SAME (still unexpired) claim set now acts on zero rows
  perform pg_temp.act('a77ccc22-0000-4000-8000-0000000000a2', 'cashier', 'a77aaa01-0000-4000-8000-0000000000a1', 'a77bbb11-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.branches where id = 'a77bbb11-0000-4000-8000-0000000000a1'),
      0::bigint, 'T48 attack: the deactivated staff member''s token sees zero branch rows');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.staff where id = 'a77ccc22-0000-4000-8000-0000000000a2'),
      0::bigint, 'T49 attack: the deactivated staff member''s token sees zero staff rows');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.organizations),
      0::bigint, 'T50 attack: the deactivated staff member''s token sees zero organizations');

  insert into tap_log (line)
    select extensions.throws_ok(
      $t$select app.deactivate_staff('a77ccc11-0000-4000-8000-0000000000a1')$t$,
      '42501', null::text, 'T51 attack: the deactivated (stale-token) caller cannot deactivate others');
  perform pg_temp.act('a77ccc33-0000-4000-8000-0000000000b3', 'org_admin', 'a77aaa02-0000-4000-8000-0000000000b2');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$select app.deactivate_staff('a77ccc11-0000-4000-8000-0000000000a1')$t$,
      '42501', null::text, 'T52 attack: org_admin B cannot deactivate organization A staff (cross-tenant RPC guard)');
  perform pg_temp.act('a77ccc11-0000-4000-8000-0000000000a1', 'org_admin', 'a77aaa01-0000-4000-8000-0000000000a1');
  insert into tap_log (line)
    select extensions.throws_ok(
      $t$select app.deactivate_staff('a77ccc22-0000-4000-8000-0000000000a2')$t$,
      'P0001', null::text, 'T53 attack: deactivation is one-shot (already-inactive target refused)');

  -- =======================================================================
  -- G9. PLATFORM REACH (control: platform tier sees all orgs by design)
  -- =======================================================================
  perform pg_temp.act('a77fff99-0000-4000-8000-00000000ffff', 'platform_admin');
  insert into tap_log (line)
    select extensions.is(
      (select count(*) from public.organizations),
      3::bigint, 'T54 control: platform tier sees all three fixture organizations');

  insert into tap_log (line) select * from extensions.finish();
end
$suite$;

-- The only result set the single-result harnesses print: the full TAP log.
select line from tap_log order by rn;

rollback;
