-- Phase 02: core Silid schema, generated from the reviewed live-database
-- iteration in this migration. Keep this file aligned with Supabase migration
-- history through the MCP apply_migration operation.

create extension if not exists pgtap with schema extensions;
create extension if not exists pg_cron with schema extensions;

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated;

-- Harden the platform's RLS auto-enable helper inherited from the empty
-- project. The event trigger continues to invoke it as its owner.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  plan_status text not null default 'reserved',
  created_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null,
  rate_config jsonb not null default '{"addons":{"towel":"20","pillow":"50","blanket":"20","big_foam":"300","bed_sheet":"20","small_foam":"200","extension_charge":"150"},"canteen":{"catalogue":{"bottled_water":{"label":"Bottled Water","price":"30","category":"Drinks & Beers"},"bottled_soft_drinks":{"label":"Bottled Soft Drinks","price":"40","category":"Drinks & Beers"},"coffee":{"label":"Coffee","price":"30","category":"Drinks & Beers"},"juice_in_can":{"label":"Juice in Can","price":"70","category":"Drinks & Beers"},"red_bull":{"label":"Red Bull","price":"80","category":"Drinks & Beers"},"gatorade_500ml":{"label":"Gatorade 500ml","price":"80","category":"Drinks & Beers"},"pale_pilsen_bottled":{"label":"Pale Pilsen Bottled","price":"80","category":"Drinks & Beers"},"san_mig_light_bottled":{"label":"San Mig Light Bottled","price":"80","category":"Drinks & Beers"},"red_horse_500ml":{"label":"Red Horse 500ml","price":"90","category":"Drinks & Beers"},"red_horse_1l":{"label":"Red Horse 1L","price":"170","category":"Drinks & Beers"},"big_curls":{"label":"Big Curls","price":"60","category":"Snacks"},"biscuits":{"label":"Biscuits","price":"20","category":"Snacks"},"fudge_bar":{"label":"Fudge Bar","price":"20","category":"Snacks"},"spicy_bulalo_bulalo":{"label":"Spicy Bulalo / Bulalo","price":"75","category":"Cup Noodles"},"jiampong":{"label":"Jiampong","price":"75","category":"Cup Noodles"},"sotanghon":{"label":"Sotanghon","price":"60","category":"Cup Noodles"},"marlboro_pack":{"label":"Marlboro (pack)","price":"250","category":"Cigars"},"trust_condom":{"label":"Trust Condom","price":"70","category":"Others"},"lighter":{"label":"Lighter","price":"20","category":"Others"},"safeguard":{"label":"Safeguard","price":"25","category":"Others"},"shampoo_conditioner":{"label":"Shampoo / Conditioner","price":"25","category":"Others"},"toothbrush":{"label":"Toothbrush","price":"30","category":"Others"},"toothpaste":{"label":"Toothpaste","price":"20","category":"Others"},"napkin":{"label":"Napkin","price":"20","category":"Others"},"drivemax_coffee":{"label":"Drivemax Coffee","price":"120","category":"Others"},"drivemax_capsule":{"label":"Drivemax Capsule","price":"170","category":"Others"}},"overrides":{}},"extension":{"grace_minutes":"25","block_minutes":"60","block_charge":"150"},"stay_types":{"short_time":{"duration_minutes":"180","base_pax":"2","flat_base":"450","extra_pax_charge":"200"},"overnight":{"duration_minutes":"720","tiers":{"2":"1100","3":"1400","4":"1700"},"surcharge_base_pax":"4","extra_pax_charge":"300"}}}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.staff (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  branch_id uuid references public.branches(id),
  email text not null,
  role text not null check (role in ('cashier', 'org_admin', 'platform_admin')),
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint staff_role_branch_shape check (
    (role = 'cashier' and branch_id is not null) or
    (role <> 'cashier' and branch_id is null)
  ),
  constraint staff_org_email_uniq unique (org_id, email)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  room_number text not null,
  status text not null default 'vacant' check (status in ('vacant', 'occupied', 'grace', 'overdue')),
  created_at timestamptz not null default now(),
  constraint rooms_branch_room_number_uniq unique (branch_id, room_number)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  room_id uuid not null references public.rooms(id),
  cashier_id uuid not null references public.staff(id),
  booking_type text not null check (booking_type in ('short_time', 'overnight')),
  pax integer not null check (pax >= 1),
  base_rate numeric not null default 0 check (base_rate >= 0),
  surcharges numeric not null default 0 check (surcharges >= 0),
  total numeric not null default 0 check (total >= 0),
  checked_in_at timestamptz not null default now(),
  booked_end_at timestamptz not null,
  checked_out_at timestamptz,
  status text not null default 'active' check (status in ('active', 'closed', 'voided')),
  void_reason text
);

create table if not exists public.session_addons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  session_id uuid not null references public.sessions(id),
  item text not null,
  qty integer not null check (qty >= 1),
  unit_price numeric not null check (unit_price >= 0),
  total numeric not null check (total >= 0),
  added_at timestamptz not null default now(),
  cashier_id uuid not null references public.staff(id)
);

create table if not exists public.canteen_sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  session_id uuid references public.sessions(id),
  item text not null,
  qty integer not null check (qty >= 1),
  unit_price numeric not null check (unit_price >= 0),
  total numeric not null check (total >= 0),
  sold_at timestamptz not null default now(),
  cashier_id uuid not null references public.staff(id)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  opened_by uuid not null references public.staff(id),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.staff(id),
  closed_at timestamptz,
  expected_room numeric not null default 0,
  expected_addons numeric not null default 0,
  expected_canteen numeric not null default 0,
  expected_total numeric not null default 0,
  counted_total numeric,
  variance numeric,
  status text not null default 'open' check (status in ('open', 'closed'))
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  branch_id uuid references public.branches(id),
  actor_id uuid not null,
  action text not null,
  target_table text not null,
  target_id uuid not null,
  old_data jsonb,
  new_data jsonb,
  ts timestamptz not null default now()
);

create index if not exists branches_org_id_idx on public.branches(org_id);
create index if not exists staff_org_id_idx on public.staff(org_id);
create index if not exists staff_branch_id_idx on public.staff(branch_id);
create index if not exists rooms_org_id_idx on public.rooms(org_id);
create index if not exists rooms_branch_id_idx on public.rooms(branch_id);
create index if not exists sessions_org_id_idx on public.sessions(org_id);
create index if not exists sessions_branch_id_idx on public.sessions(branch_id);
create index if not exists sessions_room_id_idx on public.sessions(room_id);
create index if not exists session_addons_org_id_idx on public.session_addons(org_id);
create index if not exists session_addons_branch_id_idx on public.session_addons(branch_id);
create index if not exists session_addons_session_id_idx on public.session_addons(session_id);
create index if not exists canteen_sales_org_id_idx on public.canteen_sales(org_id);
create index if not exists canteen_sales_branch_id_idx on public.canteen_sales(branch_id);
create index if not exists canteen_sales_session_id_idx on public.canteen_sales(session_id);
create index if not exists shifts_org_id_idx on public.shifts(org_id);
create index if not exists shifts_branch_id_idx on public.shifts(branch_id);
create index if not exists audit_log_org_id_idx on public.audit_log(org_id);
create index if not exists audit_log_branch_id_idx on public.audit_log(branch_id);
create index if not exists audit_log_target_idx on public.audit_log(target_table, target_id);
create unique index if not exists one_active_session_per_room on public.sessions(room_id) where status = 'active';
create unique index if not exists one_open_shift_per_branch on public.shifts(branch_id) where status = 'open';

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.staff enable row level security;
alter table public.rooms enable row level security;
alter table public.sessions enable row level security;
alter table public.session_addons enable row level security;
alter table public.canteen_sales enable row level security;
alter table public.shifts enable row level security;
alter table public.audit_log enable row level security;

revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;

grant select on public.organizations, public.branches, public.staff, public.rooms,
  public.sessions, public.session_addons, public.canteen_sales, public.shifts, public.audit_log
  to authenticated;
grant insert on public.rooms, public.sessions, public.session_addons, public.canteen_sales,
  public.shifts, public.audit_log to authenticated;
