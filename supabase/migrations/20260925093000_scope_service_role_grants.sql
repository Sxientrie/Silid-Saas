-- Phase 03 (correction, demanded by suites 01 and 09): the earlier blanket
-- service-role grant violated the append-only access model — Invariant 3
-- keeps the ledgers and audit trail INSERT-only for EVERY role including
-- the platform/service tier, and suite 01 asserts the ledger grant posture
-- while the attack battery (svc-1) asserts no direct ledger read. The
-- service role is the trusted server path's key, not a tenant role: it gets
-- exactly what the trusted paths exercise — full DML on the
-- organization-management surfaces, INSERT-only on audit_log — and NOTHING
-- on the transactional ledgers (any future service need grants per phase).

revoke all on all tables in schema public from service_role;

grant select, insert, update, delete on table public.organizations to service_role;
grant select, insert, update, delete on table public.branches to service_role;
grant select, insert, update, delete on table public.staff to service_role;
grant insert on table public.audit_log to service_role;
