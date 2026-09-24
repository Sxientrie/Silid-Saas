-- Phase 02 · Deliverable 10: vault-07/20 strict rate-config validation and
-- unknown-key-preserving merge.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.organizations (id, name)
values ('14000000-0000-0000-0000-000000000001', 'Rates org');
insert into public.branches (id, org_id, name, rate_config)
values (
  '24000000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000001',
  'Rates branch',
  ('{"stay_types":{"short_time":{"flat_base":"450"}},"extension":{"grace_minutes":"25","block_minutes":"60","block_charge":"150"},"canteen":{"catalogue":{"bottled_water":{"label":"Bottled Water","price":"30","category":"Drinks & Beers"}},"overrides":{}},"unknown_top":{"keep":"yes"}}'::jsonb)
);
insert into public.staff (id, org_id, branch_id, email, role, display_name)
values ('34000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', null, 'admin@example.test', 'org_admin', 'Admin');

select set_config('request.jwt.claims', '{"sub":"34000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"org_admin","org_id":"14000000-0000-0000-0000-000000000001","branch_id":null}}', true);
set local role authenticated;

select lives_ok(
  $$ update public.branches set rate_config = public.merge_rate_config(
    '24000000-0000-0000-0000-000000000001',
    '{"bottled_water":"35"}'::jsonb,
    '{"grace_minutes":"0","block_minutes":"90","block_charge":"175.50"}'::jsonb
  ) where id = '24000000-0000-0000-0000-000000000001' $$,
  'vault-20: organization admin merge path executes'
);
select is((select rate_config #>> '{canteen,overrides,bottled_water}' from public.branches where id = '24000000-0000-0000-0000-000000000001'), '35', 'vault-08/20: canteen override merges');
select is((select rate_config #>> '{extension,grace_minutes}' from public.branches where id = '24000000-0000-0000-0000-000000000001'), '0', 'vault-07: zero grace is valid');
select is((select rate_config #>> '{extension,block_minutes}' from public.branches where id = '24000000-0000-0000-0000-000000000001'), '90', 'vault-07: block minutes merges');
select is((select rate_config #>> '{extension,block_charge}' from public.branches where id = '24000000-0000-0000-0000-000000000001'), '175.50', 'vault-07: decimal block charge merges');
select is((select rate_config #>> '{unknown_top,keep}' from public.branches where id = '24000000-0000-0000-0000-000000000001'), 'yes', 'vault-20: unknown top-level key is preserved');
select is((select rate_config #>> '{stay_types,short_time,flat_base}' from public.branches where id = '24000000-0000-0000-0000-000000000001'), '450', 'vault-20: room-rate key outside the owned sections is preserved');

select throws_ok(
  $$ update public.branches set rate_config = public.merge_rate_config('24000000-0000-0000-0000-000000000001', '{}'::jsonb, '{"block_minutes":"0"}'::jsonb) where id = '24000000-0000-0000-0000-000000000001' $$,
  '22023', 'invalid block_minutes override', 'vault-07: zero block length is refused'
);
select throws_ok(
  $$ update public.branches set rate_config = public.merge_rate_config('24000000-0000-0000-0000-000000000001', '{}'::jsonb, '{"block_charge":"0.00"}'::jsonb) where id = '24000000-0000-0000-0000-000000000001' $$,
  '22023', 'invalid block_charge override', 'vault-07: zero block price is refused'
);
select throws_ok(
  $$ update public.branches set rate_config = public.merge_rate_config('24000000-0000-0000-0000-000000000001', '{}'::jsonb, '{"grace_minutes":"25.0"}'::jsonb) where id = '24000000-0000-0000-0000-000000000001' $$,
  '22023', 'invalid grace_minutes override', 'vault-07: fractional grace is refused'
);
select throws_ok(
  $$ update public.branches set rate_config = public.merge_rate_config('24000000-0000-0000-0000-000000000001', '{}'::jsonb, '{"block_charge":"-1"}'::jsonb) where id = '24000000-0000-0000-0000-000000000001' $$,
  '22023', 'invalid block_charge override', 'vault-07: negative block price is refused'
);
select throws_ok(
  $$ update public.branches set rate_config = public.merge_rate_config('24000000-0000-0000-0000-000000000001', '{"unknown_item":"1"}'::jsonb, '{}'::jsonb) where id = '24000000-0000-0000-0000-000000000001' $$,
  '22023', 'unknown canteen catalogue item', 'vault-08/20: unknown catalogue override is refused'
);
select is((select rate_config #>> '{extension,block_minutes}' from public.branches where id = '24000000-0000-0000-0000-000000000001'), '90', 'vault-07/20: failed validations leave stored config unchanged');

reset role;
select * from finish();
rollback;
