-- Phase 02 · Deliverable 8 crosswalk (DB side): the seeded branches.rate_config
-- column default IS the database-side money reference fixture. The production
-- arithmetic (app.stay_amounts, app.extension_blocks_due, app.overstay_params)
-- must recompute the spec/domain-rules.md §1.4 worked examples and the
-- vault-06 block goldens exactly. The independent recomputation lives in
-- packages/db (fixture) and packages/testing (gate); together they prove no
-- single arithmetic path can drift.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- The branch takes the DEFAULT rate_config: the seeded rate card itself.
insert into public.organizations (id, name)
values ('17000000-0000-0000-0000-000000000001', 'Parity org');
insert into public.branches (id, org_id, name)
values ('27000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', 'Parity branch');

-- §1.4 short-time totals: flat base plus per-extra-guest surcharge.
select is((select base + surcharge from app.stay_amounts('27000000-0000-0000-0000-000000000001', 'short_time', 2)), 450::numeric, 'vault-01: short-time 2 guests totals 450 from the seeded card');
select is((select base + surcharge from app.stay_amounts('27000000-0000-0000-0000-000000000001', 'short_time', 3)), 650::numeric, 'vault-02: short-time 3 guests totals 650 from the seeded card');
select is((select base + surcharge from app.stay_amounts('27000000-0000-0000-0000-000000000001', 'short_time', 4)), 850::numeric, 'vault-02: short-time 4 guests totals 850 from the seeded card');
select is((select base + surcharge from app.stay_amounts('27000000-0000-0000-0000-000000000001', 'short_time', 5)), 1050::numeric, 'vault-02: short-time 5 guests totals 1050 from the seeded card');

-- §1.4 overnight totals: tiers then the beyond-four surcharge.
select is((select base + surcharge from app.stay_amounts('27000000-0000-0000-0000-000000000001', 'overnight', 2)), 1100::numeric, 'vault-03: overnight 2 guests totals 1100 from the seeded card');
select is((select base + surcharge from app.stay_amounts('27000000-0000-0000-0000-000000000001', 'overnight', 3)), 1400::numeric, 'vault-03: overnight 3 guests totals 1400 from the seeded card');
select is((select base + surcharge from app.stay_amounts('27000000-0000-0000-0000-000000000001', 'overnight', 4)), 1700::numeric, 'vault-03: overnight 4 guests totals 1700 from the seeded card');
select is((select base + surcharge from app.stay_amounts('27000000-0000-0000-0000-000000000001', 'overnight', 5)), 2000::numeric, 'vault-03: overnight 5 guests totals 2000 from the seeded card');
select is((select base + surcharge from app.stay_amounts('27000000-0000-0000-0000-000000000001', 'overnight', 6)), 2300::numeric, 'vault-03: overnight 6 guests totals 2300 from the seeded card');
select is((select base from app.stay_amounts('27000000-0000-0000-0000-000000000001', 'overnight', 1)), 1100::numeric, 'vault-03: a one-guest overnight resolves to the lowest tier');

-- vault-06 block boundaries at the fixture's 25/60/150 defaults.
select is(app.extension_blocks_due('27000000-0000-0000-0000-000000000001', now(), now() + interval '25 minutes'), 0, 'vault-05/06: the exact close of grace is overdue with zero blocks');
select is(app.extension_blocks_due('27000000-0000-0000-0000-000000000001', now(), now() + interval '25 minutes' + interval '1 minute'), 1, 'vault-06: one minute past grace bills one block');
select is(app.extension_blocks_due('27000000-0000-0000-0000-000000000001', now(), now() + interval '25 minutes' + interval '60 minutes'), 1, 'vault-06: a fully elapsed block still bills one block');
select is(app.extension_blocks_due('27000000-0000-0000-0000-000000000001', now(), now() + interval '25 minutes' + interval '61 minutes'), 2, 'vault-06: one minute into the second hour bills a second block');

-- The seeded card carries the 25/60/150 overstay defaults (vault-07).
select is((select grace_minutes from app.overstay_params('27000000-0000-0000-0000-000000000001')), 25, 'vault-07: seeded grace default is 25 minutes');

select * from finish();
rollback;
