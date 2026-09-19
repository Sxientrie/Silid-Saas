# Project Overview

Silid (Tagalog for "room") is a rebrand and full rewrite of a legacy
single-tenant motel front-desk management tool into a production-grade,
multi-tenant SaaS platform. The legacy system — studied in
`spec/legacy-gap-analysis.md` and captured as replayable fixtures in
`spec/legacy-behavior-vault.md` — runs one company's five motel branches on
handwritten-ledger replacements: room sessions, check-in/check-out flows,
canteen point-of-sale, overstay charging, audit logging, and offline-safe
writes. Silid keeps that domain, rebuilds every layer of it to professional
standards, and wraps it in a tenancy model the legacy never had.

This file is the entry point to the specification set. Each sibling file
owns one topic and cross-references the others.

## What the product does

The business runs five motel branches (Idol Motel, Double-B, Lucky Star,
Happy Nest, Bulls Eye) from fixed front-desk computers. Cashiers log guest
check-ins and check-outs; the system computes every peso figure itself —
room rate by stay type and guest count, per-guest surcharges, overstay
extension blocks, canteen and add-on line items — from per-branch
configuration. Cash drawers reconcile at shift handover against a
server-computed expected-cash figure. Nothing transactional can be edited
or deleted; corrections go through an admin-only void with a mandatory
written reason, and every act lands in an append-only audit trail. The
product's reason to exist is the question the legacy overview posed: where
is every peso, who collected it, and when?

The normative statement of all business behavior lives in
`spec/domain-rules.md`. Every rule there traces to a vault scenario
(`vault-01` … `vault-20`) in `spec/legacy-behavior-vault.md`.

## The three tiers

Silid is multi-tenant. The platform tier (the SaaS operator) provisions
organizations; an organization is a tenant company (in v1, the legacy
company with its five branches is the first tenant); a branch is a
front-desk operation inside an organization with its own cashiers, rooms,
rates, and ledgers. Isolation between tiers is enforced at three layers —
session-derived scope, route-guarding middleware, and database Row-Level
Security — and is treated as the product's first invariant. See
`spec/multi-tenancy.md`, `spec/authentication.md`, and `spec/data-model.md`.

## Applications

Three applications ship in the initial release; `spec/applications.md`
details each:

1. **Platform Admin** — the operator's portal. v1 scope: organization
   management only (create organizations, manage status and branch
   structure).
2. **Landing** — the public marketing site. No self-serve signup in v1;
   tenant provisioning is operator-driven.
3. **Frontdesk** — the organization-facing application for cashiers and
   organization administrators: sessions, rooms, add-ons, canteen, rates,
   shift, staff, and reports, organized as vertical feature slices, with an
   offline-first PWA shell for the desk machines.

## Backend and infrastructure

The backend is Supabase — managed Postgres with Row-Level Security, Auth,
Edge Functions, Storage, Realtime, backups, and point-in-time recovery.
The client owns no server and no database; nothing in any phase may assume
infrastructure beyond Supabase's platform (or its local emulated stack for
development tests). `spec/supabase.md` records this as architecture,
including the MCP-server and official-skill operating rules every agent
session follows.

## Scope decisions for the first release

These are recorded decisions, not open questions; downstream specs cite
them rather than re-arguing them.

| Decision | Stance | Driver |
|---|---|---|
| Offline-first Frontdesk | Kept | Front-desk operations must survive connectivity outages at branch sites; power protection (UPS + generator rule) makes true outages rare, so the sync layer is designed as a safeguard, not the primary path. If the client confirms branch connectivity is reliable, this is the first scope item to cut. |
| Tenant provisioning | Operator-driven | The operator creates organizations in Platform Admin; the Landing app is marketing-only in v1. |
| Platform Admin | Minimal | v1 covers organization management only; audit logging itself is built from the start, the system-wide review UI is not. |
| Data migration from legacy | Deferred | The rewrite launches empty; legacy stays the system of record for history (see Cutover below). |
| Roles | Exactly one per tier | `platform_admin`, `org_admin`, `cashier` — deliberate scoping for a lean first release (`spec/authentication.md`). |
| Platform billing | Out of scope | No payment processing, invoicing, or subscription UI is designed or built in this pass (see Terminology in `spec/00-master-goal.md`). |

## Known future phases (noted, not designed)

The following are recorded so no downstream session has to guess, and so
the v1 data model reserves conceptual space where stated — none of them is
designed or built in the roadmap produced by this pass:

- **Platform billing.** The SaaS operator charging organization tenants for
  their subscription. The organization data model carries a
  subscription/plan status field as reserved conceptual space; no payment
  processing, invoicing, or subscription-management UI exists in v1.
- **Automated data migration from legacy.** At cutover the legacy system is
  frozen read-only and remains the system of record for historical data;
  the new system starts with current master data (rooms, rates, staff,
  organization/branch structure) entered through its own admin surfaces. A
  future phase may import history; nothing in this build assumes it.
- **Self-serve signup.** The Landing app grows tenant onboarding after v1;
  provisioning stays operator-driven until then.
- **System-wide audit review UI.** Audit logging is built from the start;
  the platform-tier review interface is a future phase.
- **Anomaly detection and alerts, canteen inventory, exportable reports,
  printable receipts, guest history.** The legacy's own post-v1 wishlist,
  restated as future candidates — none is committed to the initial release.

## Cutover and data

The roadmap's final phase ends at production-ready plus a cutover runbook:
a plain-language checklist for freezing the legacy system, verifying the
new system against it, and switching daily operations over. Verification is
driven by the behavioral vault — the runbook replays every `vault-<nn>`
scenario against the new system and diffs results against the vault's
goldens (and against the legacy system itself where it can still run in a
sandbox). Parity is measured against the vault, not against prose. Go-live
execution and staff training consume the runbook; they are operator
activities outside the build phases.

## How to read the spec set

| File | Owns |
|---|---|
| `spec/00-master-goal.md` | Governance: invariants, pipeline, standing rules |
| `spec/project-overview.md` | This file — scope, decisions, future phases |
| `spec/legacy-gap-analysis.md` | What carries forward, what is discarded, role mapping |
| `spec/legacy-behavior-vault.md` | The replayable behavior fixtures and their plain-language mirror |
| `spec/domain-rules.md` | Normative business rules and the money reference fixture |
| `spec/supabase.md` | The managed backend, its protocol, and security rules |
| `spec/tech-stack.md` | Pinned technologies with version-and-source table |
| `spec/multi-tenancy.md` | The three-tier model and isolation layers |
| `spec/authentication.md` | Roles, identity, claims, token policy |
| `spec/data-model.md` | Tables, tenancy columns, ledger discipline |
| `spec/offline-sync.md` | The Frontdesk offline contract and sync architecture |
| `spec/monorepo-structure.md` | Package layout, naming conventions, scaffolding provenance |
| `spec/applications.md` | The three applications and their v1 boundaries |
| `spec/deployment-operations.md` | CI/CD, hosting, environments, the project ref |
| `spec/builder-protocol.md` | How builder sessions run: the loop, generator-first, verify-before-trust |
