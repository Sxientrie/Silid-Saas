# Data Model

This file defines the v1 schema shape: tables, tenancy columns, the
money/attribution discipline, and where each invariant is enforced. It
describes the model the database phase (roadmap 02) authors as Supabase
migrations with pgTAP policy tests; it is not the migration SQL itself —
migrations are generated through the Supabase CLI (`spec/supabase.md` §2).

Conventions (`spec/monorepo-structure.md`): tables are snake_case and
plural; every org-scoped table carries `org_id`, every branch-scoped table
carries `branch_id`, both indexed foreign keys; role identifiers are the
verbatim strings from `spec/authentication.md`; identifiers are UUIDs;
timestamps are `timestamptz`; money is `numeric` (never float).

## 1. Tenancy and structure tables

### organizations

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| name | text | tenant company name |
| status | text | active / suspended (platform-managed) |
| plan_status | text | reserved conceptual space for platform billing (a future phase) — carried but unused in v1 |
| created_at | timestamptz | server-sealed |

Platform-owned: no `org_id` (this is the tenant root). Written only by
platform-tier provisioning paths.

### branches

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| org_id | uuid | FK, indexed — tenancy |
| name | text | branch name |
| rate_config | jsonb | full per-branch rate card: stay types, tiers, surcharges, overstay parameters, catalogue price overrides (§6) |
| created_at | timestamptz | server-sealed |

`rate_config` is JSONB because its sanctioned write path is a merge
operation that preserves keys it does not own (vault-20,
`spec/domain-rules.md` §1.5); the canonical default values come from the
money reference fixture.

### staff

The staff profile (distinct from the auth identity, which lives in Supabase
Auth). Staff rows exist only for tenant roles (`cashier`, `org_admin`): a
`platform_admin` identity lives in Supabase Auth with no tenant staff row,
and its claims carry null `org_id`/`branch_id` (`spec/authentication.md`
§2). The staff table's role column therefore holds `cashier` /
`org_admin` in practice; `platform_admin` is listed for completeness of
the role vocabulary.

| Column | Type | Notes |
|---|---|---|
| id | uuid | matches the Supabase Auth user id |
| org_id | uuid | FK, indexed — tenancy |
| branch_id | uuid | nullable FK, indexed — set for cashiers, null for org admins |
| email | text | login credential, managed by Supabase Auth |
| role | text | cashier / org_admin (platform_admin identities carry no staff row) |
| display_name | text | desk-facing name |
| is_active | boolean | deactivation flag; deactivation revokes sessions first (`spec/authentication.md` §5) |
| created_at | timestamptz | server-sealed |

The role and tenancy claims in `app_metadata` mirror this row and are
provisioned/re-provisioned only through server-side paths
(`spec/authentication.md` §2–§5).

### rooms

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| org_id | uuid | FK, indexed — tenancy |
| branch_id | uuid | FK, indexed — tenancy |
| room_number | text | desk-facing identifier; unique per branch |
| status | text | vacant / occupied / grace / overdue — CHECK-constrained |
| created_at | timestamptz | server-sealed |

Room status transitions are server-side only (`spec/domain-rules.md` §4):
the check-in transaction, the scheduled escalation job, and the checkout
transaction are the only writers; no client path updates status.

## 2. Transactional ledgers (append-only)

The ledgers below split into two disciplines, both enforcing Invariant 3:

- **Truly immutable rows — INSERT-only for every role including the
  platform tier.** `session_addons`, `canteen_sales`, and `audit_log` have
  no UPDATE or DELETE path of any kind; a posted row is permanent. The
  void path (§9 of domain rules) applies to sessions only — line items are
  immutable by recorded decision (a noted future phase adds line-item
  voids).
- **State-bearing rows — `sessions` and `shifts`.** These carry a status
  lifecycle, so they are written after insert solely by their named server
  transitions: the checkout transaction and the void path for sessions;
  the close and record-count paths for shifts. Those transitions run as
  database functions inside one transaction each, perform only their
  column-scoped change (status, sealed money, sealed instants, void
  reason), and write the accompanying audit entry. Row-Level Security
  grants direct UPDATE and DELETE to no role on any ledger — a client can
  reach the transitions only through the sanctioned procedures, and no
  path exists that reopens a closed session, unseals sealed money, or
  overwrites a recorded count.

Every row carries permanent attribution: the acting cashier, the branch,
and a server-sealed instant (Invariant 2d). Client-supplied timestamps are
never accepted; server triggers or RPCs seal time (Invariant 2a). Every
peso column is computed server-side from configuration (Invariant 2c).

### sessions

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| org_id | uuid | FK, indexed — tenancy |
| branch_id | uuid | FK, indexed — tenancy |
| room_id | uuid | FK to rooms |
| cashier_id | uuid | FK to staff — check-in attribution, permanent |
| booking_type | text | short_time / overnight |
| pax | integer | guest count, validated ≥ business minimum |
| base_rate | numeric | sealed at checkout (§4) |
| surcharges | numeric | sealed at checkout |
| total | numeric | sealed at checkout: base + surcharge + add-ons + extension blocks |
| checked_in_at | timestamptz | server-sealed at insert |
| booked_end_at | timestamptz | server-derived: checked_in_at + stay duration |
| checked_out_at | timestamptz | nullable; server-sealed at checkout |
| status | text | active / closed / voided — CHECK-constrained |
| void_reason | text | nullable; populated only by the void path |

Integrity enforcement:

- **One active session per room**: a partial unique index on
  `(room_id) WHERE status = 'active'` — the database-level double-booking
  guard the legacy lacked (vault-16).
- **booked_end_at is trigger-derived** from checked_in_at and
  booking_type; clients cannot supply it.
- **Money columns are sealed only by the checkout transaction** (§4);
  no other write path touches them.

### session_addons

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| org_id | uuid | FK, indexed — tenancy |
| branch_id | uuid | FK, indexed — tenancy |
| session_id | uuid | FK to sessions |
| item | text | catalogue id (§6) |
| qty | integer | ≥ 1 |
| unit_price | numeric | server-computed from config at posting |
| total | numeric | server-computed: unit_price × qty |
| added_at | timestamptz | server-sealed |
| cashier_id | uuid | FK to staff |

The `extension_charge` item is rejected on this table's cashier insert
path — checkout is its only writer (`spec/domain-rules.md` §3.2, vault-09).

### canteen_sales

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| org_id | uuid | FK, indexed — tenancy |
| branch_id | uuid | FK, indexed — tenancy |
| session_id | uuid | nullable FK to sessions — optional linkage (§5 of domain rules) |
| item | text | catalogue id |
| qty | integer | ≥ 1 |
| unit_price | numeric | server-computed from config (branch override or catalogue default) |
| total | numeric | server-computed: unit_price × qty |
| sold_at | timestamptz | server-sealed |
| cashier_id | uuid | FK to staff |

### shifts

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| org_id | uuid | FK, indexed — tenancy |
| branch_id | uuid | FK, indexed — tenancy |
| opened_by | uuid | FK to staff — server-derived from claims |
| opened_at | timestamptz | server-sealed |
| closed_by | uuid | nullable FK to staff |
| closed_at | timestamptz | nullable; server-sealed |
| expected_room | numeric | sealed at close by the close RPC |
| expected_addons | numeric | sealed at close |
| expected_canteen | numeric | sealed at close |
| expected_total | numeric | sealed at close |
| counted_total | numeric | nullable; the one-shot physical count |
| variance | numeric | nullable; counted − expected, sealed with the count |
| status | text | open / closed — CHECK-constrained |

Integrity enforcement:

- **One open shift per branch**: partial unique index on
  `(branch_id) WHERE status = 'open'` (vault-13, vault-16).
- Expected columns are frozen at close and never recomputed; the count is
  one-shot (`spec/domain-rules.md` §8).

### audit_log

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| org_id | uuid | nullable FK, indexed — tenancy; null only for platform-tier actions |
| actor_id | uuid | the Supabase Auth user id of the acting identity (a staff id for tenant roles; a platform identity for operator actions) — server-derived, never client-supplied |
| action | text | e.g. void_session, update_rate_config, check_in, check_out |
| target_table | text | affected table |
| target_id | uuid | affected row |
| old_data | jsonb | nullable snapshot before |
| new_data | jsonb | nullable snapshot after |
| ts | timestamptz | server-sealed |

Insert-only at the database layer for every role, including the platform
tier. Voids and configuration changes write their audit row in the same
transaction as the change they record (vault-12, vault-17).

## 3. What is deliberately absent in v1

- **No payments table.** Money is implicitly cash-at-desk collected before
  check-in; method capture is a legacy-suggestion future candidate
  (`spec/project-overview.md`).
- **No line-item void path.** Canteen and add-on rows are immutable;
  session/shift voids exist, line-item voids are a future phase
  (`spec/domain-rules.md` §9, `spec/project-overview.md`).
- **No guest personal data** (Invariant 4). Sessions carry a guest count,
  never names, contacts, or visit history.
- **No inventory/stock ledger** for the canteen (future candidate).
- **No platform-billing tables** beyond the reserved `plan_status` field
  on organizations.

## 4. Where each invariant is enforced

| Invariant | Enforcement points |
|---|---|
| 1. Tenant isolation | session-derived scope (tRPC), route middleware, RLS policies on every table with `org_id`/`branch_id`; partial unique indexes scoped by tenancy; pgTAP tests prove cross-tenant refusals (`spec/multi-tenancy.md`) |
| 2a. Server-sealed time | `timestamptz` columns default to `now()` via triggers; RPCs use database clocks; no insert path accepts authoritative instants |
| 2b. No edit, no delete | ledgers have no UPDATE/DELETE policies; void RPC is the only correction path; CHECK constraints pin statuses |
| 2c. Server-computed money | totals, unit prices, and products are computed in RPCs/triggers from `branches.rate_config`; client figures are display-only |
| 2d. Permanent attribution | cashier_id / branch_id / org_id on every transactional row, NOT NULL, never reassigned (no UPDATE path exists) |
| 3. Append-only history | INSERT-only policy set on all ledgers and audit_log for every role |
| 4. No guest personal data | schema carries none; the attack battery greps for and attacks any personal-data surface |
| 5. Legacy porting prohibition | provenance rule, not schema — new schema shares no identifiers or structure with legacy SQL (`spec/legacy-gap-analysis.md`) |

## 5. Nullability discipline on money and attribution

- Money columns on ledgers (`base_rate`, `surcharges`, `total`,
  `unit_price`, expected columns) are NOT NULL with server-applied values;
  a nullable peso figure is a proof gap under the Money Recomputation
  Gate. On `sessions` the money columns carry server-applied zeros at
  insert and are sealed by the checkout transaction — the pre-seal zeros
  are defaults, not figures, and the Money Recomputation Gate computes
  over sealed rows only. The only nullable money is
  `counted_total`/`variance` on shifts — null has business meaning ("no
  count recorded") and the display layer distinguishes it
  (`spec/domain-rules.md` §8).
- Attribution columns (`cashier_id`, `opened_by`, `closed_by`, `actor_id`,
  `branch_id`, `org_id`) are NOT NULL wherever a row is transactional;
  `branch_id` on audit rows is nullable only for platform-tier actions,
  which the audit row makes visible by absence. The checkout act and the
  shift count are attributed through the audit trail (the transitions
  write audit entries); `sessions` carries no separate `checked_out_by`
  column and `shifts` no `counted_by` column — a recorded design decision,
  not an omission.

## 6. The money reference fixture

The database phase builds the machine-readable money fixture from
`spec/domain-rules.md` §1 (rate card, tiers, surcharges, overstay
parameters) plus the catalogues and worked examples, and imports the
vault's goldens as a parity fixture. Every charge test imports the
fixture; no test re-types a peso figure (MONEY REFERENCE RULE,
`spec/00-master-goal.md`).
