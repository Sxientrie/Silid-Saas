-- Phase 03: restore the service role's standard full DML grants on the
-- public tables. Phase 02's revocation of the platform-wide default
-- privileges correctly stripped anon/authenticated to the access model,
-- but also stripped service_role — which every trusted server path (the
-- provisioning Edge Function, seeding, maintenance) runs through. The
-- service role bypasses RLS by design and is never client-facing; the
-- Supabase default posture grants it full table access.

grant select, insert, update, delete on all tables in schema public to service_role;
