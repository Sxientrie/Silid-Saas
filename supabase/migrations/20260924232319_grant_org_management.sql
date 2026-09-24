-- Phase 03: the Data API privileges for the organization-management access
-- model. Phase 02 authored the RLS policies for these surfaces; this grants
-- the table privileges the policies assume (new tables are no longer
-- auto-exposed to the Data API — recorded in PROGRESS.md 2026-09-20).
-- No DELETE grant exists anywhere: no delete policy exists.
-- rooms/ledgers stay untouched here — their phases grant what they exercise.

grant select, insert, update on table public.organizations to authenticated;
grant select, insert, update on table public.branches to authenticated;
grant select, insert, update on table public.staff to authenticated;
