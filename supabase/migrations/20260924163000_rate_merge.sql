-- Phase 02: database-side rate-config merge (vault-07/20).

create or replace function public.merge_rate_config(
  row_branch_id uuid,
  canteen_overrides jsonb,
  extension_overrides jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare cfg jsonb; override_key text; override_value text;
begin
  if not (jsonb_typeof(canteen_overrides) = 'object' and jsonb_typeof(extension_overrides) = 'object') then
    raise exception using errcode = '22023', message = 'rate overrides must be objects';
  end if;

  select rate_config into cfg from public.branches where id = row_branch_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'branch not found'; end if;
  cfg := coalesce(cfg, '{}'::jsonb);

  for override_key, override_value in
    select e.key, e.value #>> '{}' from jsonb_each(canteen_overrides) e
  loop
    if not exists (
      select 1 from jsonb_object_keys(coalesce(cfg #> '{canteen,catalogue}', '{}'::jsonb)) catalogue_key
      where catalogue_key = override_key
    ) then
      raise exception using errcode = '22023', message = 'unknown canteen catalogue item';
    end if;
    if override_value !~ '^[0-9]{1,12}(\.[0-9]+)?$' or override_value::numeric < 0 then
      raise exception using errcode = '22023', message = 'invalid canteen price override';
    end if;
    cfg := jsonb_set(cfg, array['canteen', 'overrides', override_key], to_jsonb(override_value), true);
  end loop;

  if extension_overrides ? 'grace_minutes' then
    override_value := extension_overrides ->> 'grace_minutes';
    if override_value !~ '^[0-9]{1,9}$' then
      raise exception using errcode = '22023', message = 'invalid grace_minutes override';
    end if;
    cfg := jsonb_set(cfg, '{extension,grace_minutes}', to_jsonb(override_value), true);
  end if;
  if extension_overrides ? 'block_minutes' then
    override_value := extension_overrides ->> 'block_minutes';
    if override_value !~ '^[0-9]{1,9}$' or override_value::integer <= 0 then
      raise exception using errcode = '22023', message = 'invalid block_minutes override';
    end if;
    cfg := jsonb_set(cfg, '{extension,block_minutes}', to_jsonb(override_value), true);
  end if;
  if extension_overrides ? 'block_charge' then
    override_value := extension_overrides ->> 'block_charge';
    if override_value !~ '^[0-9]{1,12}(\.[0-9]+)?$' or override_value::numeric <= 0 then
      raise exception using errcode = '22023', message = 'invalid block_charge override';
    end if;
    cfg := jsonb_set(cfg, '{extension,block_charge}', to_jsonb(override_value), true);
  end if;
  if extension_overrides - array['grace_minutes', 'block_minutes', 'block_charge'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'unknown extension override';
  end if;

  return cfg;
end;
$$;
revoke all on function public.merge_rate_config(uuid, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.merge_rate_config(uuid, jsonb, jsonb) to authenticated;
grant update (rate_config) on public.branches to authenticated;
