-- Phase 02 · Deliverable 1 structural proof (spec/data-model.md §1–2).
-- Runs via `supabase db test` (CI, local stack) or the MCP equivalent
-- (spec/supabase.md §6): pipe this file's SQL through execute_sql.
-- Any failed assertion raises via the DO block; the final SELECT is the
-- evidence row. Everything rolls back. Plain catalog asserts are used
-- instead of pgTAP helper functions (helper signatures unstable across
-- pgTAP builds under literal args — recorded in PROGRESS.md).

begin;

create temp table _r (name text, ok boolean);

insert into _r
select 'table exists: ' || t,
       exists (select 1 from pg_tables where schemaname='public' and tablename=t)
from (values ('organizations'),('branches'),('staff'),('rooms'),('sessions'),
             ('session_addons'),('canteen_sales'),('shifts'),('audit_log')) x(t);

insert into _r
select 'RLS enabled: ' || c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('organizations','branches','staff','rooms','sessions',
                    'session_addons','canteen_sales','shifts','audit_log');

insert into _r
select 'partial unique: one active session per room',
       exists (select 1 from pg_indexes
               where schemaname='public' and tablename='sessions'
                 and indexname='one_active_session_per_room')
union all
select 'partial unique: one open shift per branch',
       exists (select 1 from pg_indexes
               where schemaname='public' and tablename='shifts'
                 and indexname='one_open_shift_per_branch')
union all
select 'unique: room_number per branch',
       exists (select 1 from pg_constraint
               where conrelid='public.rooms'::regclass and contype='u');

insert into _r
select 'indexed tenancy FK ' || t || '.' || col,
       exists (select 1 from pg_indexes i
               where i.schemaname='public' and i.tablename=t
                 and i.indexdef ilike '%' || col || '%')
from (values
  ('branches','org_id'),
  ('staff','org_id'), ('staff','branch_id'),
  ('rooms','org_id'), ('rooms','branch_id'),
  ('sessions','org_id'), ('sessions','branch_id'),
  ('session_addons','org_id'), ('session_addons','branch_id'),
  ('canteen_sales','org_id'), ('canteen_sales','branch_id'),
  ('shifts','org_id'), ('shifts','branch_id'),
  ('audit_log','org_id'), ('audit_log','branch_id')
) as x(t, col);

insert into _r
select 'no ' || priv || ' grant for ' || rol || ' on ' || tbl,
       not has_table_privilege(rol, 'public.' || tbl, priv)
from (values
  ('authenticated','sessions','UPDATE'), ('authenticated','sessions','DELETE'),
  ('authenticated','session_addons','UPDATE'), ('authenticated','session_addons','DELETE'),
  ('authenticated','canteen_sales','UPDATE'), ('authenticated','canteen_sales','DELETE'),
  ('authenticated','shifts','UPDATE'), ('authenticated','shifts','DELETE'),
  ('authenticated','audit_log','UPDATE'), ('authenticated','audit_log','DELETE'),
  ('service_role','sessions','UPDATE'), ('service_role','sessions','DELETE'),
  ('service_role','session_addons','UPDATE'), ('service_role','session_addons','DELETE'),
  ('service_role','canteen_sales','UPDATE'), ('service_role','canteen_sales','DELETE'),
  ('service_role','shifts','UPDATE'), ('service_role','shifts','DELETE'),
  ('service_role','audit_log','UPDATE'), ('service_role','audit_log','DELETE'),
  ('anon','sessions','SELECT'), ('anon','sessions','INSERT')
) as x(rol, tbl, priv);

insert into _r
select 'insert grant for authenticated on ' || tbl,
       has_table_privilege('authenticated', 'public.' || tbl, 'INSERT')
from (values ('sessions'), ('session_addons'), ('canteen_sales'),
              ('shifts'), ('audit_log'), ('rooms')) as x(tbl);

insert into _r
select 'sessions money/attribution columns not null',
       not exists (select 1 from pg_attribute a
                   where a.attrelid = 'public.sessions'::regclass
                     and a.attname = any (array['base_rate','surcharges','total',
                                                'cashier_id','org_id','branch_id',
                                                'checked_in_at','booked_end_at'])
                     and a.attnotnull = false);

insert into _r
select 'audit_log actor_id not null',
       (select a.attnotnull from pg_attribute a
        where a.attrelid='public.audit_log'::regclass and a.attname='actor_id');

insert into _r
select 'rate_config default seeds the §1 rate card',
       (select pg_get_expr(ad.adbin, ad.adrelid) ~* '"flat_base"\s*:\s*"450"'
             and pg_get_expr(ad.adbin, ad.adrelid) ~* '"grace_minutes"\s*:\s*25'
             and pg_get_expr(ad.adbin, ad.adrelid) ~* '"pillow"\s*:\s*"50"'
        from pg_attrdef ad
        where ad.adrelid = 'public.branches'::regclass
          and ad.adnum = (select attnum from pg_attribute
                          where attrelid='public.branches'::regclass
                            and attname='rate_config'));

insert into _r
select 'rls_auto_enable not executable by authenticated',
       not has_function_privilege('authenticated',
             'public.rls_auto_enable()', 'EXECUTE');

do $$
begin
  if exists (select 1 from _r where not ok) then
    raise exception 'SCHEMA TEST FAILURES: %',
      (select string_agg(name, ' | ') from _r where not ok);
  end if;
end $$;

select count(*) as total,
       count(*) filter (where ok) as passed,
       count(*) filter (where not ok) as failed,
       json_agg(json_build_object('name', name, 'ok', ok) order by name) as tests
from _r;

rollback;
