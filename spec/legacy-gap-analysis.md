# Legacy Gap Analysis

This document is the bridge between the legacy system and the Silid
specification set. It records which legacy domain behavior is correct and
carries forward conceptually, how the legacy behaves when several cashiers
work the same branch at once, which structural choices were unsound and are
deliberately discarded, what is unique about this business that the rewrite
must preserve, and how the legacy's two roles map onto the new three-tier
role model. Behavior is described in this project's own words; the
executable form of every behavior lives in `spec/legacy-behavior-vault.md`
(scenario IDs `vault-01` … `vault-20`), and the normative statement of each
rule lives in `spec/domain-rules.md`.

**Provenance and honesty of the source.** The legacy copy on disk contains
the full application source, its documentation set, its generated database
type definitions, and a set of post-hoc audit notes, but not the database
migrations or server-function sources those documents describe. The legacy
therefore could not be executed in a sandbox for this pass. Every vault
golden is marked `OBSERVED (unit-test-asserted)` where the legacy's own
committed tests assert the exact value, and `DERIVED` (with reasoning)
elsewhere. Where the legacy documentation and the legacy code disagree, the
code is treated as what the system actually did and the documentation as
what it was meant to do; both are recorded where the difference matters.

---

## 1. Domain rules that are correct and carry forward

### 1.1 The rate card and guest-billing arithmetic

The business prices rooms by stay type and guest count, and the legacy
arithmetic matches the published rate card. Short time is a flat ₱450 for
up to two guests for three hours, with ₱200 per additional guest. Overnight
is twelve hours with tiered pricing — ₱1,100 for two guests, ₱1,400 for
three, ₱1,700 for four — and ₱300 per guest beyond four. The tier structure
matters: guests three and four move the price along the tier list rather
than through the per-head surcharge, and the surcharge base only applies
from five guests up. This exact reconciliation, with worked examples, is
vault-01 through vault-03.

The rewrite preserves the numbers and the tier logic, but changes one thing
deliberately: in legacy the rate card is hard-coded, while the per-branch
configuration surface (see 1.4) was designed to hold it. Silid makes the
full rate card — room tiers, surcharges, extension parameters, catalogue
prices — per-branch configurable data from day one, computed server-side
from that configuration for every peso figure.

### 1.2 The overstay ladder

The legacy's most refined piece of domain logic is the overstay ladder. A
session is `booked` inside its window, `grace` during the free 25-minute
window after the booked end, and `overdue` once grace closes. Past grace,
each *started* block (sixty minutes by default) bills one full ₱150 charge:
one minute past grace costs ₱150, a full hour still costs ₱150, one minute
into the second hour costs ₱300. No proration exists. The countdown on the
desk is display math; the authoritative extension money is sealed server-side
at checkout by counting the blocks due and subtracting whatever the desk
already posted, so the same block can never be charged twice. Per-branch
overrides exist for the three parameters with strict validation: invalid
values silently fall back to the 25/60/₱150 defaults rather than erroring,
zero is legal for grace but never for block length or price, and the
length caps exist so server-side casts cannot overflow. All of this is
vault-05 through vault-07, and it carries forward as normative rules in
`spec/domain-rules.md`.

### 1.3 The accountability spine

The legacy's reason to exist is the question "where is every peso, who
collected it, and when?" — and the rules that answer it are correct and
carry forward untouched:

- **Server-sealed time.** Clients never supply authoritative timestamps.
  Check-in, checkout, sale instants, audit instants — all are assigned by
  the database or a trusted server path (vault-04, vault-10, vault-11).
- **No edit, no delete.** Transactional rows are written once. Corrections
  happen through the admin-only void path, which requires a written reason,
  marks the row voided, and appends an audit entry in the same transaction
  (vault-12). The audit trail itself is insert-only for every role,
  including the admin (vault-17).
- **Full payment before check-in, strictly no refunds.** The house policy is
  explicit in the legacy documentation: no partial payments, no deferred
  payment, no refund function. Silid keeps this as a domain rule; the
  confirmation step is part of check-in, and the system has no refund path.
- **Permanent attribution.** Every transactional row carries the cashier,
  the branch, and the server-sealed moment, forever (vault-08, vault-09,
  vault-10).

### 1.4 Per-branch configuration

Each branch configures its own canteen price overrides and overstay
parameters. The legacy's write path is a merge operation that preserves
configuration keys it does not own, so two administrators editing different
sections never clobber each other — a correct design (vault-20) that carries
forward as the only sanctioned configuration write path. The rate editor's
client-side validation deliberately mirrors the server's acceptance rules so
that values the server would silently ignore are blocked at save time; the
rewrite keeps that mirror-by-construction discipline.

Two legacy configuration gaps are treated as defects, not precedents: the
room rate card is not configurable at all (its editor is a placeholder), and
canteen sales in legacy are standalone rows that cannot attach to a guest's
session. Silid makes the full rate card configurable per branch and links
canteen sales to sessions optionally (see 4.2).

### 1.5 Shift close-out and cash reconciliation

The legacy's shift lifecycle is correct and carries forward almost
verbatim: one open shift per branch enforced by the database; closing seals
an expected-cash breakdown computed entirely server-side; the physical
count is optional and one-shot; variance is counted minus expected and is
displayed as short/over/exact/no-count; closing requires connectivity
because sealing totals while offline writes are pending would freeze wrong
numbers (vault-13). The bucketing rule is the subtle part and carries
forward as normative: money belongs to the shift in which it *reached the
desk* — room revenue by checkout instant, canteen by sale instant, add-ons
by posting instant — never to the shift of the cashier who checked the
guest in. Voided sessions are excluded everywhere. The live summary the
desk sees while the shift runs deliberately mirrors the close-time
arithmetic so the close never surprises (vault-14).

### 1.6 Canteen and add-ons as separate line-item flows

Canteen sales are independent point-of-sale rows (item, quantity, unit
price, product, cashier, branch, server instant) with per-branch price
overrides; guest add-ons (towel, bed sheet, blanket, pillow, big foam,
small foam) post against the guest's active session and flow into the
sealed checkout total. The extension-charge line is a special add-on row
that only checkout may write — the desk can never post it by hand, which
protects the block-count arithmetic (vault-08, vault-09).

---

## 2. Concurrency behavior in legacy

Multi-cashier operation is the normal case for this business — five
branches, a fixed desk machine per branch, staff rotating at handover.

- **Same-branch simultaneous sessions** work correctly in legacy: each
  session is an independent row; the desk's views refresh on short polling
  intervals precisely so that sessions other cashiers create or close
  appear promptly. The legacy has no server push — its "real-time"
  dashboards are fifteen-second polling — so cross-cashier visibility lags
  by up to that interval. Silid keeps the multi-cashier correctness and
  replaces polling with proper server-driven updates where the architecture
  needs them.
- **Shift handover races** are guarded by the database: a branch can have
  at most one open shift, so two cashiers cannot both run shifts and split
  the revenue attribution (vault-16, scenario A). Closing while another
  cashier records a sale is legal and reconciles correctly under the
  money-reaches-the-desk rule.
- **Same-room races are NOT guarded in legacy.** Nothing prevents two
  active sessions on one room: the check-in path performs no
  double-booking check, and no database constraint exists (vault-16,
  scenario B). This is the legacy's most dangerous concurrency defect and
  is treated as a requirement for Silid: one active session per room,
  enforced at the database layer so no client race can beat it. Silid's
  attack battery owns a test for exactly this — two cashiers, one room,
  same instant, one must fail cleanly.
- **Concurrent configuration edits** are safe by the merge-write design
  (1.4).
- **Concurrent offline replays** are idempotent by construction — replayed
  writes upsert on a stable identity so a network hiccup cannot duplicate a
  row — though in practice the legacy never exercised this path (see
  3.4 and vault-18's caveat).

---

## 3. Structural decisions that were unsound and are discarded

The legacy is a competent single-tenant prototype with real domain
thoughtfulness in its final migration era, but its architecture cannot
carry a multi-tenant product. The following are discarded deliberately.

### 3.1 Single-tenant assumptions everywhere

The legacy data model has no organization concept: one company, five
branches, no tenant boundary, and no isolation layer above the branch. Every
tenancy-critical write accepts the branch and actor identifiers from the
client's own state, which is acceptable only inside one trusted company.
Silid introduces the three-tier model (platform / organization / branch)
with isolation enforced at three layers — session-derived scope resolution,
middleware route-guarding, and database row-level security as the
non-bypassable backstop — and never accepts a tenant identifier from the
client. See `spec/multi-tenancy.md`.

### 3.2 Identity and authorization built from a profile table

Legacy resolves the caller's role and branch by reading a staff table with
the authenticated id, then trusts client-side guards to route by it. That
is one enforceable layer, not three. Silid moves role, organization, and
branch into server-managed authorization claims on the identity token
(app_metadata, never user-editable metadata), enforces scope in the
database with tested row-level policies, and treats the UI guard as
cosmetic. See `spec/authentication.md` and `spec/supabase.md`.

### 3.3 Money computed or defaulted on the client

In the legacy's middle era, session money columns were written by no one:
check-in sent no amounts, checkout flipped status without computing a total,
and the two calculators that existed (one client-side utility, one server
function) were invoked by nothing. The final era moved the authoritative
computation into the checkout transaction, but client-computed money
remained on the canteen and add-on insert paths (the client posts the unit
price and its product). Silid's rule is absolute: every peso figure is
computed server-side from configuration; client figures are display-only.
This is Invariant 2c in `spec/00-master-goal.md` and is stated normatively
in `spec/domain-rules.md`.

### 3.4 Dead infrastructure presented as capability

Four legacy capabilities existed as code but not as behavior: the offline
queue (built and unit-tested, but no write path ever enqueued to it); the
scheduled escalation job (its schedule definition was disabled in an early
migration era and only later partially restored as a status-only job); the
admin live dashboard and audit-log screens (stubbed placeholders); and the
entire check-in/check-out form layer (stubbed placeholders while the
backend flows existed). The legacy documentation describes several of these
as working features. Silid's proof model exists precisely to prevent this
gap: nothing is claimed done without an adversarial test and a recorded
clip. The rewrite builds the offline contract for real (`spec/offline-sync.md`)
or does not claim it.

### 3.5 Client-side room-status writes and polling as integration

Legacy included a direct client write path for room status (unused) and
relied on fixed-interval polling for cross-desk visibility. Silid removes
client room-status writes entirely — the room status machine is server-side
only (vault-15) — and treats polling as a fallback, not the integration
fabric.

### 3.6 Supabase usage anti-patterns in legacy

The legacy used the same managed-Postgres platform Silid builds on, and its
usage teaches by counterexample. Its security model leaned on a
security-definer helper that resolves the caller's context, a pattern that
quietly bypasses row-level security unless written with extreme care; its
row-level policies went through a remediation migration that removed unsafe
write paths (stranding the void flow until an RPC restored it) — evidence
that policies bolted on after the fact rot. Its scheduled jobs were defined
but not scheduled for most of its life, and its edge functions duplicated
arithmetic that also lived in SQL and in the client — three owners of the
same rule. Silid's Supabase protocol (`spec/supabase.md`) forbids each of
these patterns: policies authored with the access model from the start and
proven by executable tests; one owner per arithmetic rule (the checkout
transaction and the parameterized scheduled job); scheduled money work
lives in database functions or edge functions on the platform's scheduler;
security-definer is never a patch for a permission error; and every
tenancy- or money-touching policy carries a policy test that tries to
attack it.

### 3.7 Presentation-layer coupling and hand-typed screens

The legacy hand-built every screen and primitive; its data layer was sound
but its UI layer grew by copy-paste, and several core flows never got built
at all (3.4). Silid assembles its UI from a component registry and
generators, organizes the product into vertical feature slices with strict
service/hook/component boundaries, and gives every slice a test harness
before real feature work begins. The naming and layering disciplines the
legacy documented for itself are inherited in spirit — typed constants over
magic values, pure display math separated from authoritative arithmetic,
pages as composition shells — and are restated as conventions in
`spec/monorepo-structure.md`.

---

## 4. What is unique to this business and must be preserved

### 4.1 The tamper-resistance mission

This is not generic hospitality software. The product exists because
handwritten ledgers let a dishonest employee alter, lose, backdate, or
fabricate entries with near-zero risk. Every design rule in Silid — sealed
time, append-only history, void-with-reason, permanent attribution,
expected-vs-counted cash — serves the mission stated in the legacy's own
overview: the honest employee must be able to *prove* honesty, and the
conditions that let dishonesty go undetected must not exist. The rewrite
must not trade any of this for convenience.

### 4.2 Operational shape

Details of the business's operating reality that shape the data model:

- **Five named branches under one owner** (Idol Motel, Double-B, Lucky
  Star, Happy Nest, Bulls Eye) — the seed scenario for multi-branch
  configuration and the admin's cross-branch views.
- **A fixed desktop per desk, power-protected** (UPS plus a
  generator-activation rule of fifteen minutes) — the documented reason
  true offline operation is expected to be rare; the offline queue is a
  safeguard, not the primary data path. This informs the offline-sync
  scope: Silid keeps the offline-first Frontdesk decision (see
  `spec/project-overview.md`, scope decisions) but designs the sync layer
  to the reality that outages are short and rare.
- **Canteen operated by the cashier at each branch**, sold to walk-ins and
  guests alike — hence standalone sales with optional session linkage in
  Silid, rather than session-only posting.
- **A canteen catalogue of roughly twenty-six items across five named
  categories** and a six-item add-on catalogue, captured as the machine
  -readable money fixture in `spec/domain-rules.md` (the reference values in
  vault-08/09 are the same numbers).
- **The shift handover moment** as the accountability event of the business
  day — the vault-13/14 mechanics are the product's core control, not a
  report.
- **Peso-exact arithmetic with no proration** anywhere: flat rates, tiered
  rates, started-block extension charges, quantity-times-price line items.

### 4.3 Edge cases the legacy surfaced and Silid must answer

- Garbage timestamps or non-finite clock values must never render as
  escalating charges; the display falls back to the booked-phase zeros while
  the server seals the real money (vault-05's boundary notes).
- Invalid per-branch configuration must never become punitive (per-minute
  charging via a zero-length block), free (zero-price blocks), or crash a
  server cast (overflow past the length caps) — validated on both sides,
  with the editor blocking values the server would ignore (vault-07).
- A zero or negative guest count is arithmetic-clamped in legacy; Silid
  rejects it at validation instead of relying on the clamp.
- One-pax bookings resolve to the lowest tier in legacy; Silid keeps the
  arithmetic but validates the minimum legal guest count at the form layer.
- An empty count on shift close is legal and recoverable; a second count is
  not (vault-13).

---

## 5. Role mapping: legacy two-role model → Silid three-tier model

The legacy has exactly two roles, `cashier` and `admin`. Silid has exactly
one role per tier: `platform_admin`, `org_admin`, `cashier`. The mapping is
stated explicitly here so no downstream session has to infer it.

### `cashier` → `cashier` (direct carry-forward)

The legacy cashier is already branch-scoped: reads and creates only within
the assigned branch, never updates or deletes transactional rows, and owns
the desk workflow — sessions, add-ons, canteen, and the shift. Silid's
`cashier` keeps the identical scope and surface. Nothing of the legacy
cashier moves up or down a tier. The one deliberate change is mechanical,
not role-shaped: scope arrives from server-side claims and database
policies rather than from a profile-table read trusted by the client.

### legacy `admin` → `org_admin` (with one behavior retained per surface)

The legacy admin was already doing organization-tier work without an
organization boundary around it. Mapping by surface:

| Legacy admin behavior | Silid home |
|---|---|
| Full read across all five branches | `org_admin` — cross-branch reports and dashboards |
| Void with mandatory reason | `org_admin` — the void path remains admin-tier; cashiers never void |
| Per-branch rate configuration | `org_admin` — rate configuration for the org's branches |
| Staff account creation (cashiers) | `org_admin` — staff management within the org |
| Audit trail review | `org_admin` — reviews branch and organization audit |
| Shift history and variance reconciliation across branches | `org_admin` — the cross-branch reconciliation view |

No legacy admin behavior belongs to `cashier`, and none of it rises to the
platform tier: the legacy admin was the *owner of the whole company*, which
is precisely what an organization administrator is in Silid's model.

### `platform_admin` — designed fresh, no legacy precedent

The legacy has no operator layer above the company; there is no legacy
behavior to map. Silid's `platform_admin` provisions organizations (v1
scope: organization management only, operator-driven — see
`spec/project-overview.md`), reviews system-wide audit (review UI deferred
to a future phase), and owns platform billing (a future phase, out of scope
for this build). The role exists in the data model and the authentication
spec from the start so the tenant-isolation design is complete, but no
legacy behavior informs it.

---

## 6. Discrepancies between the legacy documents, the legacy disk state, and this pass

Recorded per the verify-before-you-trust rule, so the review pass and every
downstream session sees them:

1. The legacy architecture document describes a migrations directory
   (numbered 0001–0009, plus later remediation, shift, overstay, and rate
   -configuration migrations referenced by code comments) and edge-function
   sources. Neither exists in the legacy copy on disk. The vault therefore
   grounds goldens in the sources that do exist — committed application
   code, committed tests, generated database types (which reflect the real
   final schema, including the shift and overstay machinery), and the
   legacy's audit notes.
2. The architecture document claims real-time push updates; the code
   polls every fifteen seconds and subscribes to nothing (2 above, 3.4).
3. The overview document's overnight rate card and the constants' overnight
   surcharge rule look contradictory until read together; vault-03 records
   the reconciled rule, which the code implements.
4. The legacy's upgrade-brief index (its own post-hoc audit) documents the
   middle-era money and scheduling gaps; the final-era code comments show
   the checkout-sealed contract superseding them. Where the two eras
   disagree, the vault fixes on the final era and the gap analysis records
   the history.
5. The master document's description of the legacy (edge functions named
   `calculate-charge`, `apply-grace-charge`, `create-staff-user`; a pg_cron
   grace job in migration 0009) is accurate to the legacy's design intent
   and documentation; `create-staff-user` is invoked by the legacy's staff
   feature, the two charge functions exist in design and in middle-era
   references, and the grace job existed in disabled form before the
   recurring-overstay era replaced it. The item most affected is 3.4/3.6:
   none of these sources are executable on disk today, which is why vault
   goldens carry their provenance marks.
