# Domain Rules

This file is the normative home of business behavior. Where the gap
analysis identifies what the legacy does and the vault captures it as
fixtures, this file states the rules the new system must satisfy. Every
behavioral rule cites the vault scenario (`vault-<nn>`) it traces to; the
roadmap's attack batteries cite the same scenarios when they try to break
the implementation.

Money is Philippine peso throughout. Every peso figure the system can
produce is computed server-side from configuration (Invariant 2c,
`spec/00-master-goal.md`); client-side computation of any authoritative
amount is a defect by definition.

---

## 1. The rate card (money reference values)

The values in this section are the canonical reference for every
guest-billing test and fixture. The database phase (roadmap 02) captures them
once more as a machine-readable money fixture — one file that every charge
test imports — so no test ever re-types a peso figure and spec and tests
cannot drift apart. The fixture also carries the add-on and canteen
catalogues and the overstay parameters below.

### 1.1 Stay types

Two stay types exist, each with a fixed duration set at check-in:

| Stay type | Duration | Base price | Guests covered by base |
|---|---|---|---|
| Short time | 3 hours | ₱450 flat | up to 2 |
| Overnight | 12 hours | tiered (below) | by tier |

(vault-01, vault-04)

### 1.2 Overnight tiers and surcharge

| Guests | Overnight base |
|---|---|
| 2 | ₱1,100 |
| 3 | ₱1,400 |
| 4 | ₱1,700 |
| 5+ | ₱1,700 + ₱300 per guest beyond 4 |

Tier selection takes the highest tier not exceeding the guest count. The
per-guest surcharge applies only beyond the 4-guest tier — guests three and
four are priced by tier movement, not by the surcharge. A one-guest booking
resolves to the lowest tier arithmetically. The legal minimum guest count
is 1 for both stay types; zero and negative counts are rejected at
validation, never arithmetic-clamped. (vault-03)

### 1.3 Short-time surcharge

Each guest beyond two adds ₱200: three guests ₱650, four ₱850, five
₱1,050. Surcharge is computed as the excess over two, times ₱200, on top of
the flat base. (vault-02)

### 1.4 Worked examples (recomputation targets)

These examples are part of the money reference fixture; the Money
Recomputation Gate (section 7) recomputes them through an independent path.

| Stay | Guests | Base | Surcharge | Total |
|---|---|---|---|---|
| Short time | 2 | 450 | 0 | **₱450** |
| Short time | 3 | 450 | 200 | **₱650** |
| Short time | 4 | 450 | 400 | **₱850** |
| Short time | 5 | 450 | 600 | **₱1,050** |
| Overnight | 2 | 1,100 | 0 | **₱1,100** |
| Overnight | 3 | 1,400 | 0 | **₱1,400** |
| Overnight | 4 | 1,700 | 0 | **₱1,700** |
| Overnight | 5 | 1,700 | 300 | **₱2,000** |
| Overnight | 6 | 1,700 | 600 | **₱2,300** |

### 1.5 Per-branch rate configuration

All of section 1 — stay-type durations, flat base, tiers, surcharge rules —
is per-branch configuration in the new system. The legacy hard-coded the
room rate card while making canteen prices and overstay parameters
configurable; Silid makes the entire rate card configurable per branch so
branches that price differently can be set up without code changes. The
values above are the defaults the fixture seeds. Configuration writes go
through a merge operation that preserves keys it does not own, so
concurrent editors never clobber each other (vault-20).

---

## 2. Check-in

- The cashier selects a room (defaulting to the first vacant room, with
  one-tap override for guest preference), the stay type, and the guest
  count. Payment is confirmed collected before check-in completes: full
  payment, no partial payments, no deferred payment, no refund path — the
  house policy is absolute. (vault-10)
- The session row is created with the cashier, branch, and room resolved
  server-side; the client supplies none of the three (Invariant 1). The
  check-in instant is sealed by the server; the booked end is the check-in
  instant plus the stay type's duration — a fixed offset from the check-in
  moment, never a calendar boundary. (vault-04)
- The room transitions `vacant → occupied` in the same server-side write.
  (vault-10, vault-15)
- One active session per room is a database-level guarantee: two cashiers
  checking guests into the same room at the same instant must produce
  exactly one success and one clean rejection. The legacy lacked this
  constraint (vault-16, scenario B); Silid's attack battery owns the
  two-cashiers-one-room test.
- The session's money columns are written by the server at checkout, never
  at check-in and never by the client.

## 3. The overstay ladder

A session occupies exactly one phase at any instant, derived from its own
timestamps:

1. **booked** — before the booked end. No charge accrues.
2. **grace** — after the booked end, inside the free grace window (25
   minutes default). No charge accrues; the desk sees a countdown.
3. **overdue** — after the grace window closes. Extension blocks accrue.

(vault-05)

### 3.1 Extension blocks

Past grace, each *started* block bills one full charge: `ceil(overdue
minutes ÷ block minutes)` blocks × block price. Default block is 60
minutes at ₱150. There is no proration: 1 minute past grace costs ₱150, a
full elapsed hour still costs ₱150, one minute into the second hour costs
₱300. (vault-06)

### 3.2 Sealing at checkout

The authoritative extension money is computed once, at checkout, inside
the same transaction that closes the session: blocks due (by the section
3.1 arithmetic at the checkout instant) minus blocks already posted equals
the deficit, and the deficit posts as extension-charge line items. In v1
no path posts extension rows before checkout — desk posting is forbidden
(below) and the scheduled escalation job is status-only — so the posted
quantity is zero at checkout; the subtraction is retained as a defensive
invariant and exercised by tests with synthetic posted rows, so the
arithmetic can never double-charge a block. The desk never posts an
extension charge by hand — the extension item is cashier-unpostable by
policy, enforced in the database. A session within grace at checkout
incurs nothing beyond base, surcharge, and add-ons.
(vault-11, vault-09)

### 3.3 Per-branch overstay parameters

Three parameters — grace minutes, block minutes, block price — are
per-branch configurable with defaults 25 / 60 / ₱150. Validation is strict
and identical on both sides of the wire:

- Whole minutes: digit-only text, up to 9 digits (so server integer casts
  cannot overflow). Fractional, signed, padded, exponent, or overflowing
  values fall back to the default.
- Block price: digits with optional decimals, up to 12 characters,
  strictly positive. Zero (including 0.00) falls back to the default.
- Grace may legitimately be zero; block length may not. An invalid value
  never errors — it silently falls back, and a bad configuration must
  never become punitive (per-minute charging via a zero-length block) or
  free (zero-price blocks).
- The rate editor blocks saving any value the server would ignore, so the
  configuration surface never lies about the branch's real charging
  behavior. (vault-07)

### 3.4 Garbage inputs fall back, never lie

A corrupted booked-end time (unparseable, or a non-finite clock value)
renders as the booked-phase zeros on the desk — never NaN, never infinite
accrual — while the server seals the real money from the ledger at
checkout. Garbage per-branch parameters fall back per section 3.3's
validation. The display can degrade to silence; it can never degrade to a
wrong peso figure. (vault-05)

## 4. Room status machine

Rooms move through exactly four statuses, and only the server moves them:

- `vacant → occupied` at check-in (same write as the session insert).
- `occupied → grace` when past the booked end; `grace → overdue` when past
  the grace window — advanced by the scheduled escalation job, which
  derives everything from session timestamps and is therefore idempotent:
  re-running it can never double-apply. Escalation affects status only;
  extension money is sealed exclusively at checkout.
- `{occupied|grace|overdue} → vacant` inside a server transaction that
  ends the session — checkout, or a void of an active session (§9).

No client path updates room status. (vault-15)

## 5. Canteen sales

- A canteen sale is a standalone point-of-sale row: item, quantity, unit
  price, product total, cashier, branch, and server-sealed sale instant.
  It may optionally reference a room session (so items can appear on a
  session's record), but session linkage is never required — walk-in
  sales exist. The legacy had no session linkage at all; Silid adds it as
  an option. (vault-08)
- Each cart line posts as its own row; a multi-item cart never merges into
  one row.
- Prices come from per-branch overrides where set, falling back to the
  catalogue default. Deleting an override reverts the item to the
  catalogue price. Negative unit prices are rejected by the database.
- The catalogue (default prices) is part of the money reference fixture;
  the categories are: Drinks & Beers, Snacks, Cup Noodles, Cigars, Others.
  The full normalized catalogue below is the fixture's source of values
  (sourced from the legacy constants and price list, reproduced as data
  per the Legacy Porting Prohibition):

  | Category | Item | Default price |
  |---|---|---|
  | Drinks & Beers | Bottled Water | ₱30 |
  | Drinks & Beers | Bottled Soft Drinks | ₱40 |
  | Drinks & Beers | Coffee | ₱30 |
  | Drinks & Beers | Juice in Can | ₱70 |
  | Drinks & Beers | Red Bull | ₱80 |
  | Drinks & Beers | Gatorade 500ml | ₱80 |
  | Drinks & Beers | Pale Pilsen Bottled | ₱80 |
  | Drinks & Beers | San Mig Light Bottled | ₱80 |
  | Drinks & Beers | Red Horse 500ml | ₱90 |
  | Drinks & Beers | Red Horse 1L | ₱170 |
  | Snacks | Big Curls | ₱60 |
  | Snacks | Biscuits | ₱20 |
  | Snacks | Fudge Bar | ₱20 |
  | Cup Noodles | Spicy Bulalo / Bulalo | ₱75 |
  | Cup Noodles | Jiampong | ₱75 |
  | Cup Noodles | Sotanghon | ₱60 |
  | Cigars | Marlboro (pack) | ₱250 |
  | Others | Trust Condom | ₱70 |
  | Others | Lighter | ₱20 |
  | Others | Safeguard | ₱25 |
  | Others | Shampoo / Conditioner | ₱25 |
  | Others | Toothbrush | ₱30 |
  | Others | Toothpaste | ₱20 |
  | Others | Napkin | ₱20 |
  | Others | Drivemax Coffee | ₱120 |
  | Others | Drivemax Capsule | ₱170 |

## 6. Add-ons

- Chargeable room items post against the guest's active session: towel
  ₱20, bed sheet ₱20, blanket ₱20, pillow ₱50, big foam ₱300, small foam
  ₱200. Each row carries cashier, server-sealed posting instant, quantity,
  unit price, and product total, and flows into the sealed checkout total.
  (vault-09)
- The extension-charge line item exists in the catalogue for rendering
  posted rows only; cashier attempts to post it are rejected server-side
  (vault-09, section 3.2).

## 7. The money reference fixture and recomputation

**Money Reference Rule.** The values in section 1 (rate card, tiers,
surcharges, overstay parameters, add-on catalogue, canteen catalogue, and
every worked example) are captured once more, in the database phase
(roadmap 02), as a single machine-readable fixture that every charge test
imports. No test file re-types a peso figure. Vault goldens containing
peso figures equal, or are visibly derived from, the fixture's values.

**Money Recomputation Gate.** For every peso figure the system can
produce, an independent calculation path — one that does not reuse the
production code path — must be able to arrive at the same number: worked
examples recomputed from this file's stated rules with different grouping
and summation order; posted charge events re-summed with a different
grouping than the app uses; goldens derived directly from the fixture. The
gate runs per phase as part of the review pipeline with a defined command
(`spec/builder-protocol.md` and the roadmap phase files carry the exact
invocation); a single peso of drift blocks the phase. The hunt is
explicitly for losses, duplicates, and misattributions — the failure modes
that survive naive self-agreement checks.

Any rule whose result cannot be independently recomputed is a proof gap
and must be flagged in this file before implementation begins. The current
rule set is fully recomputable: rate arithmetic (section 1), overstay
blocks (section 3), canteen and add-on line items (sections 5–6), and the
shift buckets (section 8) are all closed-form over configuration and
ledger rows.

## 8. Shifts and cash reconciliation

- A branch has at most one open shift, enforced by a partial unique index
  at the database layer. Opening a shift records the opener, branch, and
  server-sealed start; the opener is derived server-side. (vault-13,
  vault-16)
- Closing a shift is a single server transaction that seals, for the
  shift's window:
  - **room revenue** — sum of base + surcharge over non-voided sessions
    whose *checkout instant* falls in the window;
  - **add-on revenue** — the session total minus base minus surcharge over
    the same sessions (posted add-ons and extension blocks);
  - **canteen revenue** — sum of sale totals whose *sale instant* falls in
    the window;
  - **expected total** — the three sums combined.
- **Attribution rule (normative).** Money belongs to the shift in which it
  reached the desk — checkout instant for room money and for a session's
  add-on money (add-ons reach the desk as part of the session's sealed
  checkout total), sale instant for canteen money — never to the shift or
  cashier that checked the guest in. Multi-cashier branches reconcile
  correctly under this rule: a guest checked in by cashier A but checked
  out during B's shift pays into B's window, and an add-on posted during
  A's shift on a session checked out in B's shift is part of B's sealed
  total. Voided sessions are excluded everywhere. (vault-13, vault-14)
- The physical count is optional at close and one-shot forever: a closed
  shift without a count can receive exactly one count (from the admin or
  the shift's owner); a recorded count is never overwritten. Variance is
  counted minus expected; negative is short, positive is over, zero is
  exact, missing is "no count recorded". (vault-13)
- Closing requires connectivity: the desk blocks the close while offline,
  because sealing totals while offline writes are pending would freeze
  wrong numbers. (vault-13)
- **Window inclusion and serialization.** The shift window is half-open
  [opened_at, closed_at): an event sealed exactly at closed_at belongs to
  the next window. The close transaction and money-bearing desk
  transactions serialize on a per-branch lock, so every event's sealed
  instant falls entirely before the closing snapshot or strictly after
  closed_at — no event lands in both windows or in neither. (vault-13)
- **Open shift required for money.** A money-bearing desk action —
  check-in, add-on posting, canteen sale — requires an open shift on its
  branch; the procedures refuse otherwise. (vault-13)
- **Close and count permissions.** Closing is permitted to any active
  cashier of the branch and to the org tier; the count may be recorded by
  the org tier or the shift's opener; an org force-close exists so a
  branch whose desk is gone cannot hold an open shift indefinitely. The
  record-count action writes an audit entry. (vault-13)
- The live summary the desk sees while a shift runs is display-only and
  deliberately mirrors the close-time arithmetic — the close never
  surprises. (vault-14)

## 9. Void and audit

- Only the admin tier voids a session. The void requires a non-empty
  written reason, marks the session `voided`, and appends an audit entry
  capturing actor, action, target, before/after snapshots, and server
  time — all in one transaction. Voiding an active session releases its
  room to vacant in that same transaction (a voided session can never be
  checked out, so the void is the only path that can free the room).
  Voided sessions are excluded from revenue and shift expected-cash; the
  corresponding physical cash is withdrawn from the drawer as part of the
  void procedure (house rule), keeping drawer-versus-expected consistent.
  Voiding a closed session changes no sealed figures — the frozen shift
  stands and the audit trail records the correction. (vault-12)
- **Line-item immutability (recorded decision).** Canteen sale rows and
  add-on rows are immutable in v1 — no void path exists for them. A
  mis-posted line is visible in the audit trail (every posting is
  attributed) and is absorbed at shift reconciliation; a line-item void
  path is a noted future phase (`spec/project-overview.md`). Sessions and
  shifts are the only voidable rows.
- The audit trail is append-only for every role including the platform
  tier: insert-only, no update, no delete, forever. (vault-17, Invariant 3)

## 10. State machines

### Session

```
            check-in (server write)
   (none) ──────────────────────────► active ──► closed   (checkout RPC)
                                        │
                                        └────► voided   (void RPC, admin only)
```

- `active → closed` only via the checkout transaction (vault-11).
- `active → voided` and `closed → voided` only via the void path (vault-12).
- No transition reopens a closed or voided session; corrections are new
  facts (voids, new sessions), never mutations.
- Undefined transitions do not exist: any path not listed here is rejected
  by the database layer regardless of role.

### Room

```
   vacant ──check-in──► occupied ──escalation──► grace ──escalation──► overdue
      ▲                    │                      │                     │
      └────────────────────┴──────────────────────┴─────────────────────┘
                        checkout (single transaction)
```

- Escalation advances are driven only by the scheduled job; release happens
  only inside a server transaction that ends the session — checkout, or a
  void of an active session (section 4, section 9).

### Shift

```
   (none) ──open──► open ──close──► closed ──record count (once, optional)──► closed+counted
```

- One open shift per branch (database constraint). Count is one-shot
  (vault-13).

## 11. Rules the new system must fix that legacy got wrong

These are requirements, not carry-forwards; the gap analysis records the
history:

1. One active session per room, enforced at the database layer (vault-16).
2. Every peso figure computed server-side — including canteen and add-on
   line products, which the legacy's clients computed (section 5–6,
   Invariant 2c).
3. The full rate card is per-branch configuration, not hard-coded
   constants (section 1.5).
4. Offline writes exist for real: the legacy built the queue and never
   wired it; Silid's contract is specified in `spec/offline-sync.md` and
   the vault scenario carries the honesty caveat. Where the real contract
   diverges from the vault fixture, the fixture is retired through a
   CHANGELOG entry, never silently diverged.
5. Guest-count and stay-type validation happens at the form and service
   layers (legal minimums), not by arithmetic clamping.
