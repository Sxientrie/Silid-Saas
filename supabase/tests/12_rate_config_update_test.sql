-- Phase 04 · Deliverable 4: public.update_rate_config — the atomic
-- rate-configuration write path (merge + persisted update + same-transaction
-- audit entry). Scope comes from the caller's claims (RLS), unknown keys are
-- preserved (vault-20), refused values write nothing (vault-07), and the
-- audit row's actor and time are sealed by the server (vault-12/17).

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into public.organizations (id, name) values
  ('14000000-0000-4000-8000-000000000001', 'Phase04 org A'),
  ('14000000-0000-4000-8000-000000000002', 'Phase04 org B');
insert into public.branches (id, org_id, name, rate_config) values
  (
    '24000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000001',
    'Phase04 branch A1',
    ('{"stay_types":{"short_time":{"flat_base":"450"}},"extension":{"grace_minutes":"25","block_minutes":"60","block_charge":"150"},"canteen":{"catalogue":{"bottled_water":{"label":"Bottled Water","price":"30","category":"Drinks & Beers"}},"overrides":{}},"unknown_top":{"keep":"yes"}}'::jsonb)
  ),
  ('24000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000002', 'Phase04 branch B1', '{}'::jsonb);
insert into public.staff (id, org_id, branch_id, email, role, display_name) values
  ('34000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', null, 'orgadmin.a@phase04.test', 'org_admin', 'Org Admin A'),
  ('34000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'cashier.a@phase04.test', 'cashier', 'Cashier A'),
  ('34000000-0000-4000-8000-000000000003', '14000000-0000-4000-8000-000000000002', null, 'orgadmin.b@phase04.test', 'org_admin', 'Org Admin B');

-- The org A administrator acts.
select set_config('request.jwt.claims', '{"sub":"34000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"org_admin","org_id":"14000000-0000-4000-8000-000000000001","branch_id":null}}', true);
select set_config('app.test.before_call', clock_timestamp()::text, true);
set local role authenticated;

select lives_ok(
  $$ select public.update_rate_config(
    '24000000-0000-4000-8000-000000000001',
    '{"bottled_water":"35"}'::jsonb,
    '{"grace_minutes":"0","block_charge":"175.5"}'::jsonb
  ) $$,
  'vault-20: the organization-tier merge path executes through the atomic RPC'
);
select is(
  (select rate_config #>> '{canteen,overrides,bottled_water}' from public.branches where id = '24000000-0000-4000-8000-000000000001'),
  '35', 'vault-08/20: the canteen override merges into the stored card'
);
select is(
  (select rate_config #>> '{extension,grace_minutes}' from public.branches where id = '24000000-0000-4000-8000-000000000001'),
  '0', 'vault-07: zero grace is legal and merges'
);
select is(
  (select rate_config #>> '{extension,block_charge}' from public.branches where id = '24000000-0000-4000-8000-000000000001'),
  '175.5', 'vault-07: the canonical decimal charge merges'
);
select is(
  (select rate_config #>> '{unknown_top,keep}' from public.branches where id = '24000000-0000-4000-8000-000000000001'),
  'yes', 'vault-20: the keys the merge does not own are preserved in storage'
);
select is(
  (select rate_config #>> '{stay_types,short_time,flat_base}' from public.branches where id = '24000000-0000-4000-8000-000000000001'),
  '450', 'vault-20: the rate card outside the owned sections is untouched'
);

-- The same-transaction audit entry (vault-12/17): actor and time from the
-- server, snapshots before/after.
select is(
  (select count(*) from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  1::bigint, 'vault-12: exactly one audit row for the configuration change'
);
select is(
  (select action from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  'update_rate_config', 'the audit row carries the rate-configuration action'
);
select is(
  (select actor_id::text from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  '34000000-0000-4000-8000-000000000001', 'the audit actor is the verified caller (auth.uid()), never client-supplied'
);
select is(
  (select org_id::text from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  '14000000-0000-4000-8000-000000000001', 'the audit org is claim-derived (seal trigger)'
);
select is(
  (select branch_id from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  null, 'the org tier carries no branch claim, so the sealed branch is null (claim-derived, not target-derived)'
);
select is(
  (select old_data #>> '{extension,block_charge}' from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  '150', 'vault-17: the before snapshot is captured'
);
select is(
  (select new_data #>> '{extension,block_charge}' from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  '175.5', 'vault-17: the after snapshot is captured'
);
select is(
  (select ts >= current_setting('app.test.before_call')::timestamptz from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  true, 'the audit instant is the server clock at/after the call'
);
select is(
  (select ts <= clock_timestamp() from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  true, 'the audit instant is server-sealed (the RPC signature accepts no time)'
);

-- A refused value writes nothing and audits nothing (vault-07).
select throws_ok(
  $$ select public.update_rate_config(
    '24000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    '{"block_minutes":"0"}'::jsonb
  ) $$,
  '22023', 'invalid block_minutes override', 'vault-07: zero block length is refused at the service path'
);
select is(
  (select rate_config #>> '{extension,block_minutes}' from public.branches where id = '24000000-0000-4000-8000-000000000001'),
  '60', 'vault-07/20: a refused merge leaves the stored card unchanged'
);
select is(
  (select count(*) from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  1::bigint, 'a refused configuration change writes no audit row'
);

-- A cashier of the branch can read it but has no update policy row: the
-- merge's locked re-read (SELECT ... FOR UPDATE evaluates the UPDATE
-- policy's USING clause, which a cashier cannot pass) refuses loudly —
-- no write, no silent no-op, no audit row. (The API's organization-tier
-- procedure refuses cashiers earlier still.)
select set_config('request.jwt.claims', '{"sub":"34000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"cashier","org_id":"14000000-0000-4000-8000-000000000001","branch_id":"24000000-0000-4000-8000-000000000001"}}', true);
select throws_ok(
  $$ select public.update_rate_config(
    '24000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    '{"block_charge":"200"}'::jsonb
  ) $$,
  'P0002', 'branch not found', 'a cashier cannot update rate configuration (no UPDATE-policy row to lock)'
);
select set_config('request.jwt.claims', '{"sub":"34000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"org_admin","org_id":"14000000-0000-4000-8000-000000000001","branch_id":null}}', true);
select is(
  (select count(*) from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001'),
  1::bigint, 'the cashier refusal wrote no audit row (counted by an org-tier reviewer)'
);

-- Another organization's administrator cannot even see the target branch.
select set_config('request.jwt.claims', '{"sub":"34000000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"role":"org_admin","org_id":"14000000-0000-4000-8000-000000000002","branch_id":null}}', true);
select throws_ok(
  $$ select public.update_rate_config(
    '24000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    '{}'::jsonb
  ) $$,
  'P0002', 'branch not found', 'a foreign org admin gets no rows and no write (tenant isolation)'
);

-- The platform tier may update through server-side paths and its action is
-- audited with null org/branch (spec/multi-tenancy.md §5). Its identity has
-- no staff row (spec/data-model.md §1).
select set_config('request.jwt.claims', '{"sub":"34000000-0000-4000-8000-000000000009","role":"authenticated","app_metadata":{"role":"platform_admin","org_id":null,"branch_id":null}}', true);
select lives_ok(
  $$ select public.update_rate_config(
    '24000000-0000-4000-8000-000000000001',
    '{}'::jsonb,
    '{}'::jsonb
  ) $$,
  'the platform tier can act on a tenant branch through server-side paths'
);
select is(
  (select org_id from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001' order by ts desc limit 1),
  null, 'the platform action is audited with null org'
);
select is(
  (select branch_id from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001' order by ts desc limit 1),
  null, 'the platform action is audited with null branch'
);
select is(
  (select actor_id::text from public.audit_log where target_table = 'branches' and target_id = '24000000-0000-4000-8000-000000000001' order by ts desc limit 1),
  '34000000-0000-4000-8000-000000000009', 'the platform action is audited with the true actor'
);

reset role;
select * from finish();
rollback;
