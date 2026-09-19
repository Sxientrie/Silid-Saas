# Multi-Tenancy Model

Silid is multi-tenant from the first migration. This file defines the three
tiers, the isolation contract between them, and the three enforcement
layers that make the contract non-bypassable. The role identifiers and
their scopes live in `spec/authentication.md`; this file owns the data
isolation model.

## 1. The three tiers

1. **Platform tier — the SaaS operator.** Owns all organizations. v1
   surface: organization management only (create organizations, manage
   status and branch structure). Platform billing and the system-wide
   audit review UI are noted future phases (`spec/project-overview.md`);
   audit logging itself is built from the start.
2. **Organization tier — a tenant company.** Manages its own branches,
   frontdesks, staff, rate configuration, and reports. Organizations
   cannot view or access any other organization's data: Org A cannot see
   Org B, C, or D, and vice versa.
3. **Branch tier — a front-desk operation inside an organization.**
   Branches hold the transactional surfaces: sessions, add-ons, canteen,
   shifts, rooms. A branch cannot view another branch's data even within
   the same organization.

The first tenant is the legacy company with its five branches. The legacy
had no tier above the company and no isolation layer above the branch —
both are new in Silid (`spec/legacy-gap-analysis.md` §3.1).

## 2. The isolation contract

- Organization A cannot read, write, or observe organization B's rows at
  any layer — API, database, realtime, storage.
- A branch cannot read, write, or observe a sibling branch's rows, even in
  the same organization, except through surfaces the organization tier
  explicitly grants (cross-branch reports are organization-tier reads,
  computed for the org, not branch-to-branch reads).
- Tenant identifiers are never accepted from clients. The organization and
  branch a request acts on are derived from the authenticated session's
  server-side claims; a request body or query parameter naming an
  org/branch is at best redundant and at worst an attack — the server
  always resolves scope itself.
- The platform tier can reach all organizations by design, through
  server-side paths; the platform tier is not a tenant and its access is
  itself audited.

## 3. The three enforcement layers

**Layer 1 — session-derived scope resolution.** Every server-side
procedure resolves the caller's organization, branch, and role from the
authenticated session's claims (app_metadata; `spec/authentication.md`).
Client-supplied identifiers never participate in scope decisions.

**Layer 2 — middleware route-guarding.** Each application guards routes by
role and tier before data procedures run: cashiers reach only their
branch's surfaces, organization admins only their org's, platform admins
only the operator portal. Route-guarding is user-experience enforcement;
it is never trusted as a security boundary on its own.

**Layer 3 — Postgres Row-Level Security (the non-bypassable backstop).**
Every org-scoped table carries `org_id`; every branch-scoped table carries
`branch_id` (both indexed foreign keys). Row-Level Security policies
derive scope from the JWT's claims, never from request data. Even a
compromised client or a missed middleware check leaves the database
refusing cross-tenant rows. Policies follow the security checklist in
`spec/supabase.md` §5 verbatim — `TO <role>` plus an ownership predicate,
`USING` and `WITH CHECK` on writes, no deprecated `auth.role()` — and
every tenancy- or money-touching policy carries a pgTAP policy test run
via `supabase db test` proving a specific tenant/branch cannot reach
another's rows.

## 4. What this means for the data model

`spec/data-model.md` carries the table-by-table detail; the tenancy
discipline is:

| Table kind | Scope column | Example |
|---|---|---|
| Platform-owned | none (system tables) | organizations |
| Organization-scoped | `org_id` | branches, staff memberships |
| Branch-scoped | `org_id` + `branch_id` | rooms, sessions, session add-ons, canteen sales, shifts, audit entries (rate configuration lives branch-scoped in `branches.rate_config`) |

Transactional ledgers follow the two append-only disciplines of
`spec/data-model.md` §2: `session_addons`, `canteen_sales`, and
`audit_log` are INSERT-only for every role including the platform tier;
`sessions` and `shifts` are written after insert only through their named
server transitions (checkout, void, close, count). No role has a direct
UPDATE or DELETE path on any ledger (Invariant 3); void semantics, not
updates, are the only correction mechanism (`spec/domain-rules.md` §9).

## 5. Attack surfaces owned by this model

The isolation model is proven, not asserted. The standing attack scenarios
each relevant phase must exercise:

- An organization A session requesting organization B's rows by id —
  zero rows at the database, regardless of the API layer.
- A cashier at branch 1 requesting branch 2 rooms within the same
  organization — zero rows.
- A forged request body naming another branch as the target — the server
  ignores it; scope comes from claims.
- A direct PostgREST call with a valid token but an out-of-scope id —
  RLS refuses.
- A platform-tier actor writing to a transactional ledger — this does not
  occur in v1: the platform tier provisions organizations and accounts and
  reads audit; it does not post to tenant ledgers. Its actions are audited
  with null org/branch on the audit row.
