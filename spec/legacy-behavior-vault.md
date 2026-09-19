# Legacy Behavioral Vault

The vault is the machine-readable record of legacy behavior that Silid must
reproduce. Each scenario below is a replayable fixture: exact inputs, expected
outputs, state transitions, boundary cases, and arithmetic goldens. The
plain-language mirror in the final section restates every scenario in business
terms for client sign-off; the sign-off travels through DECISIONS-NEEDED.md as
a confirm-or-report-corrections query with confirm-by-default.

**Provenance marking.** The legacy system could not be executed in a sandbox
for this pass: its database migrations and server functions are not present in
the legacy copy on disk, and the application requires a live managed-Postgres
backend to run. Every golden therefore carries one of two marks:

- `OBSERVED (unit-test-asserted)` — the legacy repository contains an
  executable test asserting this exact value; the golden is copied from the
  test's expectation, not re-reasoned.
- `DERIVED` — the golden is derived from the legacy's committed logic and
  documentation; the reasoning is stated inline and is re-checkable against
  the sources named in the scenario.

`derived_from` names those sources: the legacy documentation set (the project
overview and architecture documents under the legacy `docs/` folder), the
legacy source tree (constants, services, utilities, and their committed unit
tests), the legacy's generated database type definitions, and the legacy's
own post-hoc audit notes (the upgrade-brief index). No legacy source text is
reproduced here; everything is restated as normalized data.

**Naming rule.** Scenario IDs (`vault-01` … `vault-20`) are referenced
verbatim by `spec/domain-rules.md`, the roadmap, tests, and the cutover
runbook. IDs are permanent; retired scenarios are marked retired, never
renumbered.

---

## Money parameters used across scenarios

All figures are Philippine peso. These are the legacy defaults; per-branch
overrides exist only for canteen prices and the three overstay parameters
(vault-07). The room rate card is NOT configurable in legacy — it is fixed in
the legacy client and server logic (see vault-01–03 and the gap analysis).

```json
{
  "currency": "PHP",
  "booking": {
    "SHORT_TIME": { "duration_hours": 3, "base_pax": 2, "flat_base_php": 450, "surcharge_per_extra_pax_php": 200 },
    "OVERNIGHT":  { "duration_hours": 12, "tiers": { "2": 1100, "3": 1400, "4": 1700 }, "surcharge_base_pax": 4, "surcharge_per_extra_pax_php": 300 }
  },
  "overstay_defaults": { "grace_minutes": 25, "block_minutes": 60, "charge_php": 150 },
  "addons": {
    "towel": 20, "bed_sheet": 20, "blanket": 20,
    "pillow": 50, "big_foam": 300, "small_foam": 200,
    "extension_charge": 150
  }
}
```

---

## vault-01 — Short-time base charge

```json
{
  "id": "vault-01",
  "title": "Short-time stay, 2 guests, base price only",
  "provenance": "DERIVED",
  "derived_from": "legacy booking constants (flat short-time base and per-pax rule), charge utility in the legacy sessions feature, and the overview document's short-time rate card",
  "input": {
    "booking_type": "SHORT_TIME",
    "pax": 2
  },
  "expected_output": { "base_php": 450, "surcharge_php": 0, "total_php": 450, "duration_hours": 3 },
  "state_transitions": [],
  "boundaries": [
    "pax below 2 is not a legal booking; legacy exposes no path that books fewer than the flat base covers",
    "pax exactly 2 produces no surcharge"
  ],
  "reasoning": "The legacy rate card prices short time as a flat 450 covering up to two persons, duration three hours. The charge utility returns the flat base for any short-time booking and adds 200 per guest beyond two."
}
```

## vault-02 — Short-time pax surcharge

```json
{
  "id": "vault-02",
  "title": "Short-time stay, each guest beyond two adds 200",
  "provenance": "DERIVED",
  "derived_from": "legacy booking constants (base_pax 2, surcharge 200 per extra), charge utility, overview rate card",
  "input": { "booking_type": "SHORT_TIME", "pax": 4 },
  "expected_output": { "base_php": 450, "extra_pax": 2, "surcharge_php": 400, "total_php": 850, "duration_hours": 3 },
  "state_transitions": [],
  "boundaries": [
    "pax 3 → 450 + 1×200 = 650",
    "pax 5 → 450 + 3×200 = 1050",
    "zero or negative pax yields 450 + 0 (the legacy utility clamps extras at zero); the booking form is the gate for legality"
  ],
  "reasoning": "Surcharge is computed as max(0, pax − 2) × 200 on top of the flat base. This is the documented house rule and the legacy utility's arithmetic."
}
```

## vault-03 — Overnight tiered base and surcharge

```json
{
  "id": "vault-03",
  "title": "Overnight stay uses tiered base prices for 2/3/4 guests, then 300 per guest beyond four",
  "provenance": "DERIVED",
  "derived_from": "charge utility in the legacy sessions feature (tier table 1100/1400/1700 with highest-matching-tier selection; surcharge base 4 at 300 per extra), overview rate card, legacy booking constants",
  "input_examples": [
    { "booking_type": "OVERNIGHT", "pax": 2, "expected": { "base_php": 1100, "surcharge_php": 0, "total_php": 1100 } },
    { "booking_type": "OVERNIGHT", "pax": 3, "expected": { "base_php": 1400, "surcharge_php": 0, "total_php": 1400 } },
    { "booking_type": "OVERNIGHT", "pax": 4, "expected": { "base_php": 1700, "surcharge_php": 0, "total_php": 1700 } },
    { "booking_type": "OVERNIGHT", "pax": 5, "expected": { "base_php": 1700, "extra_pax": 1, "surcharge_php": 300, "total_php": 2000 } },
    { "booking_type": "OVERNIGHT", "pax": 6, "expected": { "base_php": 1700, "extra_pax": 2, "surcharge_php": 600, "total_php": 2300 } }
  ],
  "expected_output": "per-example above; duration_hours 12 in all cases",
  "state_transitions": [],
  "boundaries": [
    "tier selection takes the highest tier not exceeding the guest count; one guest short of a tier pays the tier below",
    "a 1-pax overnight booking resolves to the lowest tier (1100) with no surcharge — legacy never rejects it at the arithmetic layer",
    "the overnight surcharge base is 4 even though tiers exist below 4: guests 3 and 4 are priced by tier movement (1100→1400→1700), not by the surcharge"
  ],
  "reasoning": "This reconciles the two legacy rate statements: the tiered 2/3/4-pax price list in the overview document, and the legacy constants' overnight surcharge rule (base 4, +300 each). The charge utility implements exactly this combination."
}
```

## vault-04 — Booked window is server-sealed from check-in

```json
{
  "id": "vault-04",
  "title": "Check-in stamps the start time server-side and derives booked_end from booking type",
  "provenance": "DERIVED",
  "derived_from": "legacy sessions service (check-in inserts room, booking type, and guest count only), generated database types (start and end timestamps optional on insert, end computed by a server trigger), architecture document",
  "input": { "check_in_wallclock": "2026-01-15T18:00:00Z", "booking_type": "SHORT_TIME" },
  "expected_output": {
    "checked_in_at": "server now(), client value never accepted",
    "booked_end_at": "2026-01-16T…+03:00 window: check-in instant + 3 hours",
    "overnight_equivalent": "check-in instant + 12 hours"
  },
  "state_transitions": ["room: vacant → occupied (server-side, same write)"],
  "boundaries": [
    "a client-supplied timestamp is ignored, not rejected",
    "the booked end is a fixed offset from the check-in instant, not from a calendar boundary — a 03:00 short-time check-in ends at 06:00, not at noon"
  ],
  "reasoning": "The legacy insert path sends no timestamps and no money; a database trigger assigns the start and derives the end, and the room status change happens in the same server-side write. The architecture document states the same rule."
}
```

## vault-05 — Overstay ladder phases

```json
{
  "id": "vault-05",
  "title": "A session moves booked → grace → overdue as the clock passes booked_end and the grace window",
  "provenance": "OBSERVED (unit-test-asserted)",
  "derived_from": "legacy overstay utility and its committed test suite; defaults 25/60/150",
  "input": { "booked_end_at": "2026-01-15T12:00:00Z", "grace_minutes": 25, "block_minutes": 60, "charge_php": 150 },
  "expected_output": [
    { "now_offset_minutes": -1, "phase": "booked", "grace_minutes_left": 0, "blocks_accrued": 0, "accruing_php": 0 },
    { "now_offset_minutes": 0,  "phase": "grace",  "grace_minutes_left": 25, "blocks_accrued": 0, "accruing_php": 0 },
    { "now_offset_minutes": 10, "phase": "grace",  "grace_minutes_left": 15, "blocks_accrued": 0, "accruing_php": 0 },
    { "now_offset_minutes": 25, "phase": "overdue","grace_minutes_left": 0, "overdue_minutes": 0, "blocks_accrued": 0, "accruing_php": 0 },
    { "now_offset_minutes": 26, "phase": "overdue","blocks_accrued": 1, "accruing_php": 150 }
  ],
  "state_transitions": ["display phase only; money is not posted until checkout (vault-11)"],
  "boundaries": [
    "grace begins exactly at booked_end, with the full window remaining",
    "the exact close of the grace window is overdue with zero accrued blocks and zero pesos — the first peso appears one minute past",
    "a partial grace minute rounds up in the countdown (24m30s left shows 25 minutes remaining at offset 0; 30 seconds into the window shows 25)"
  ],
  "reasoning": "Values are the legacy test suite's own assertions with fixed clock instants; the ladder is display math only, evaluated every ten seconds on the desk."
}
```

## vault-06 — Extension blocks are per-started-block

```json
{
  "id": "vault-06",
  "title": "Each started block past grace bills one full block",
  "provenance": "OBSERVED (unit-test-asserted)",
  "derived_from": "legacy overstay utility tests (block boundary cases), legacy grace constants (block 60 minutes, 150 each)",
  "input": { "booked_end_at": "2026-01-15T12:00:00Z", "grace_minutes": 25, "block_minutes": 60, "charge_php": 150 },
  "expected_output": [
    { "now_offset_minutes_after_grace": 1,   "blocks_accrued": 1, "accruing_php": 150 },
    { "now_offset_minutes_after_grace": 60,  "blocks_accrued": 1, "accruing_php": 150 },
    { "now_offset_minutes_after_grace": 61,  "blocks_accrued": 2, "accruing_php": 300 },
    { "now_offset_minutes_after_grace": 60.5, "blocks_accrued": 2, "accruing_php": 300, "note": "half-minute past the block boundary rounds up" }
  ],
  "state_transitions": [],
  "boundaries": [
    "a fully elapsed block still bills one block, not two",
    "ceil(overdue_minutes / block_minutes) × charge is the whole formula; there is no partial-block proration"
  ],
  "reasoning": "Direct test assertions in the legacy suite. The same started-block arithmetic is what the server applies at checkout when sealing the guest-billing total."
}
```

## vault-07 — Per-branch overstay parameters and their validation

```json
{
  "id": "vault-07",
  "title": "Branches may override grace minutes, block minutes, and block price; invalid values silently fall back to system defaults",
  "provenance": "OBSERVED (unit-test-asserted)",
  "derived_from": "legacy overstay utility's config reader and its committed parity tests (which mirror the server-side parameter reader in the recurring-overstay database migration), rate configuration UI",
  "input": { "rate_config.extension": "object with optional keys grace_minutes, block_minutes, charge_php" },
  "expected_rules": {
    "defaults": { "grace_minutes": 25, "block_minutes": 60, "charge_php": 150 },
    "grace_minutes": "whole minutes, digit-only text up to 9 digits; zero is legal; fractional, signed, padded, exponent, or overflowing values fall back to 25",
    "block_minutes": "whole minutes, digit-only text up to 9 digits; zero and negatives are illegal and fall back to 60 (never per-minute billing)",
    "charge_php": "digits with optional decimals, up to 12 characters, strictly positive; zero (including 0.00) is illegal and falls back to 150; trailing-dot text falls back; 150.50 is accepted as 150.5",
    "fallback_is_silent": "an invalid override never errors; the system default applies and the rate editor blocks saving values the server would ignore"
  },
  "state_transitions": [],
  "boundaries": [
    "length caps exist so the server's integer cast cannot overflow; 9-digit integers and 12-character money are accepted, one digit/character more is not",
    "a missing or malformed extension key yields the full default triple"
  ],
  "reasoning": "The legacy client carries a committed test suite asserting each of these cases in the same text form the server validates, written for explicit parity with the server-side parameter reader."
}
```

## vault-08 — Canteen sale posting

```json
{
  "id": "vault-08",
  "title": "Canteen sales are standalone line items with per-branch price overrides",
  "provenance": "DERIVED",
  "derived_from": "legacy canteen service and feature (cart of item+quantity, one posted row per cart line, client-supplied unit price from the branch's override or the catalogue default), generated database types (no session reference on canteen sales), legacy audit notes (standalone-sales fact), overview price list",
  "input": { "item": "bottled_water", "qty": 3, "unit_price_php": 30 },
  "expected_output": {
    "row": { "item": "bottled_water", "qty": 3, "unit_price_php": 30, "total_php": 90 },
    "attribution": "cashier, branch, and server-side sold_at stamp captured at posting",
    "session_link": "none — a canteen sale never references a room session in legacy"
  },
  "state_transitions": [],
  "boundaries": [
    "a cart with several items posts one row per item line, not one merged row",
    "unit price below zero is rejected by the database layer; zero is technically accepted but the editor UI steers away from it",
    "a branch override replaces the catalogue price for that item only; deleting the override reverts to the catalogue price",
    "the sold instant is server-sealed; a queued offline replay has its stamp replaced by the server's (vault-18)"
  ],
  "reasoning": "The legacy insert path posts item, quantity, unit price, and their product; the money columns are client-computed in legacy, which the rewrite must move server-side (gap analysis). Standalone-ness (no session link) is asserted by the legacy's own audit notes and the absence of any session column in the generated types."
}
```

## vault-09 — Guest add-on posting

```json
{
  "id": "vault-09",
  "title": "Chargeable room items post against the guest's active session; the extension charge is never cashier-postable",
  "provenance": "DERIVED",
  "derived_from": "legacy addon catalogue and service, generated database types (session_addons rows), legacy addon constants' documented database policy (cashier inserts of the extension item are rejected; checkout is its only writer), overview add-on price list",
  "input": { "session_id": "<active session>", "item": "pillow", "qty": 2, "unit_price_php": 50 },
  "expected_output": {
    "row": { "item": "pillow", "qty": 2, "unit_price_php": 50, "total_php": 100 },
    "attribution": "cashier, server-side added_at stamp",
    "flows_into": "the session's sealed checkout total (vault-11)"
  },
  "state_transitions": [],
  "boundaries": [
    "catalogue: towel 20, bed sheet 20, blanket 20, pillow 50, big foam 300, small foam 200",
    "posting an extension-charge item through the add-on path is rejected server-side; allowing it would corrupt the checkout block count (vault-06/11)",
    "the displayed extension item exists in the catalogue only for rendering already-posted rows"
  ],
  "reasoning": "The legacy catalogue carries an explicit comment documenting the server-side insert policy, and the checkout arithmetic counts posted quantity under the extension item id."
}
```

## vault-10 — Check-in transaction

```json
{
  "id": "vault-10",
  "title": "Check-in creates an immutable session row and occupies the room, all server-side",
  "provenance": "DERIVED",
  "derived_from": "legacy sessions service and check-in hook, generated database types, architecture document (trigger-sealed timestamps, room flip, realtime broadcast)",
  "input": { "room_id": "<vacant room in cashier's branch>", "booking_type": "SHORT_TIME | OVERNIGHT", "pax": "<integer>" },
  "expected_output": {
    "session_row": "active, with base/surcharge/total columns at their defaults until checkout seals them (legacy-era behavior; see vault-11)",
    "checked_in_at": "server-sealed",
    "booked_end_at": "server-derived per vault-04",
    "room_status": "occupied"
  },
  "state_transitions": ["session: (none) → active", "room: vacant → occupied"],
  "boundaries": [
    "payment collection is a cashier confirmation in legacy, not a recorded payment method; the house rule is full payment before the confirm step, with no partial or deferred option and no refund path",
    "the guest count and booking type are the only money-relevant inputs; the cashier never types an amount"
  ],
  "reasoning": "The legacy insert sends only room, booking type, and guest count; timestamps, end time, and room status are server work. Legacy's known defect — session money columns staying at defaults until checkout — is recorded in the gap analysis as something the rewrite must not reproduce."
}
```

## vault-11 — Check-out seals the guest-billing total

```json
{
  "id": "vault-11",
  "title": "Checkout runs as one server transaction: seal time, post extension deficit, compute total, release room",
  "provenance": "DERIVED",
  "derived_from": "generated database types (close_session RPC returning the closed session), legacy overstay utility and checkout-hook comments (authoritative figure sealed at checkout; extension deficit posting), shift service comment (extension blocks posted at checkout change expected cash), recurring-overstay upgrade brief as implemented",
  "input": { "session_id": "<active session>" },
  "expected_output": {
    "session": "status closed; checked_out_at server-sealed; total = base + surcharge + posted add-on rows + extension-block deficit",
    "extension_deficit": "blocks_due (vault-06 arithmetic at the checkout instant) minus blocks_already_posted, posted as extension-charge add-on rows; zero difference posts nothing",
    "room": "released to vacant"
  },
  "state_transitions": ["session: active → closed", "room: occupied|grace|overdue → vacant"],
  "boundaries": [
    "checkout within grace adds nothing beyond base + surcharge + add-ons",
    "checkout after grace bills every started block per vault-06, minus whatever the desk already posted, so the guest is never charged twice for the same block",
    "a session closed by this path can never be reopened; corrections go through the void path (vault-12)"
  ],
  "reasoning": "The legacy code comments state repeatedly that the authoritative money is sealed server-side at checkout, that extension blocks are deficit-counted under a fixed item id, and that the room release and summary invalidation follow. The legacy-era defect where close did not compute the total predates the final migration set and was superseded; the rewrite spec adopts the sealed-at-checkout contract as normative (spec/domain-rules.md, guest-billing arithmetic)."
}
```

## vault-12 — Void with mandatory reason

```json
{
  "id": "vault-12",
  "title": "Only the admin may void a session; the reason is mandatory and everything is recorded in one transaction",
  "provenance": "DERIVED",
  "derived_from": "legacy audit service (void RPC documented admin-only, reason-required, actor derived server-side, audit row written in the same transaction), overview document (void-with-written-reason policy), legacy audit notes (void as RPC after the UPDATE-policy removal)",
  "input": { "session_id": "<closed or active session>", "reason": "<non-empty text>" },
  "expected_output": {
    "session": "status → voided",
    "audit_row": "appended, capturing actor, action, target, before/after snapshots, server time",
    "money_effect": "voided sessions are excluded from shift expected-cash and from revenue summaries"
  },
  "state_transitions": ["session: active|closed → voided"],
  "boundaries": [
    "a void without a reason is rejected",
    "cashiers cannot void; the actor identity comes from the server session, never the request body",
    "the voided session row is never edited or deleted — void is a status change plus an audit insert",
    "the audit trail itself accepts inserts only; no role can update or delete it"
  ],
  "reasoning": "The legacy audit service documents the RPC's contract verbatim in prose comments; the overview document states the house rule. The legacy's intermediate era (void impossible after an RLS remediation) is history, not target behavior."
}
```

## vault-13 — Shift lifecycle and close-out accounting

```json
{
  "id": "vault-13",
  "title": "One open shift per branch; closing seals expected cash server-side; the physical count is optional and one-shot",
  "provenance": "DERIVED",
  "derived_from": "legacy shift service and hooks (open/close/count RPCs, one-open-shift partial unique index, online-only close rule, server-side expected-cash computation), shift reconciliation upgrade brief as implemented, shift variance display helpers",
  "input": {
    "open": "cashier requests shift open (server derives branch and actor)",
    "close": "shift id + optional physically counted amount",
    "record_count": "closed shift id + counted amount"
  },
  "expected_output": {
    "open": "shift row open with server-sealed opened_at and actor; a second open shift on the same branch is impossible by database constraint",
    "close_seals": {
      "room_revenue": "sum of base + surcharge over non-voided sessions whose checkout instant falls in the shift window",
      "addon_revenue": "session total minus base minus surcharge over the same sessions (posted add-ons and extension blocks)",
      "canteen_revenue": "sum of canteen sale totals by sold instant in the window",
      "expected_total": "the three sums combined",
      "attribution_rule": "money belongs to the shift in which it reached the desk (checkout/sale instant), never to the cashier who checked the guest in"
    },
    "counted_total": "nullable; variance = counted − expected when present",
    "record_count": "rejected on a shift that already has a count — one shot, never overwritten"
  },
  "state_transitions": ["shift: (none) → open → closed", "closed shift: count null → count set (once)"],
  "boundaries": [
    "closing requires connectivity: the desk blocks the action while offline, because sealing wrong totals offline defeats reconciliation",
    "an empty count closes the shift and leaves the variance unknown until an admin or the shift's owner records it",
    "negative variance displays as short, positive as over, zero as exact, missing as no count recorded",
    "the close moment is server-sealed; expected figures are frozen at close, never recomputed"
  ],
  "reasoning": "The legacy shift service documents the bucketing rules and the one-open-shift constraint in prose comments; the implemented reconciliation brief specifies the same design (money-reaches-the-desk attribution, voided exclusion, online-only close, one-shot count)."
}
```

## vault-14 — Live shift summary mirrors the sealed buckets

```json
{
  "id": "vault-14",
  "title": "The desk's running shift summary is display-only and must match the close-time arithmetic",
  "provenance": "DERIVED",
  "derived_from": "legacy shift service summary function and its documenting comment (buckets mirror the server-side close computation), shift summary hook (disabled until a shift window exists, 15-second refresh)",
  "input": { "window_start": "the open shift's opened_at", "branch": "the desk's branch" },
  "expected_output": {
    "room_revenue": "sum(base + surcharge) over sessions checked out in window, voided excluded",
    "addon_revenue": "sum(total) − sum(base + surcharge) over the same sessions",
    "canteen_revenue": "sum(sale totals) in window",
    "total_revenue": "checkout totals + canteen totals",
    "counts": "sessions closed and sales posted in window"
  },
  "state_transitions": [],
  "boundaries": [
    "display-only: the close-time RPC figure is authoritative even if the live sum disagrees at a boundary instant",
    "no shift open → no summary at all (the desk shows the start-shift prompt instead)"
  ],
  "reasoning": "The legacy summary function's stated purpose is to never surprise the desk at close: its buckets deliberately mirror the server's. The rewrite inherits the mirror-the-server rule."
}
```

## vault-15 — Room status machine

```json
{
  "id": "vault-15",
  "title": "Rooms move vacant → occupied → grace → overdue → vacant without any client write",
  "provenance": "DERIVED",
  "derived_from": "legacy room constants (four statuses), rooms hook comment (status advances server-side: check-in trigger, scheduled escalation job, checkout release), generated database types (apply_grace_escalation RPC), legacy audit notes and recurring-overstay brief (client room-status writes removed; job escalates status, checkout releases)",
  "input": { "triggers": ["session insert", "scheduled escalation job", "session close"] },
  "expected_output": {
    "on_check_in": "vacant → occupied",
    "on_escalation_job": "occupied → grace when past booked end; grace → overdue when past the grace window",
    "on_close": "any of occupied|grace|overdue → vacant"
  },
  "state_transitions": "as above; the ladder states exist purely so the desk grid reflects accruing rooms",
  "boundaries": [
    "no client path updates room status in the final legacy era; the direct-update service function has no callers",
    "escalation affects status only, never money — extension pesos are sealed at checkout (vault-11)",
    "the escalation job is idempotent: re-running it derives everything from session timestamps and cannot double-apply"
  ],
  "reasoning": "The legacy rooms hook names the three server-side drivers; the recurring-overstay brief (as implemented) specifies deriving escalation from booked_end so a re-fire never corrupts state."
}
```

## vault-16 — Concurrency: shift uniqueness vs. room double-booking

```json
{
  "id": "vault-16",
  "title": "Legacy prevents concurrent open shifts per branch but does NOT prevent double-booking a room — the rewrite must",
  "provenance": "DERIVED",
  "derived_from": "legacy shift service comment (one open shift per branch enforced by partial unique index), auto-room-assignment upgrade brief (no uniqueness constraint on room + active session exists; two active sessions on one room are possible; the constraint is proposed, never implemented in legacy), multi-cashier commentary in the sessions hooks",
  "input": {
    "scenario_a": "two cashiers on one branch both start a shift",
    "scenario_b": "two cashiers check guests into the same room at the same instant"
  },
  "expected_output": {
    "scenario_a": "second open rejected by the database — legacy behavior to keep",
    "scenario_b": "both inserts succeed in legacy — a defect; the rewrite makes one active session per room a database-level guarantee"
  },
  "state_transitions": [],
  "boundaries": [
    "multi-cashier operation is the normal case in legacy (the desk code explicitly refreshes on short intervals so sessions other cashiers create or close appear)",
    "shift close by one cashier while another records a sale is legal and reconciles by the money-reaches-the-desk rule (vault-13)"
  ],
  "reasoning": "The legacy's own upgrade brief audits the schema and states the double-booking gap plainly; the shift service states the unique-index guarantee. Both facts carry into the vault so the rewrite's attack battery can target them."
}
```

## vault-17 — Audit trail

```json
{
  "id": "vault-17",
  "title": "Every state-changing act lands in an append-only trail; the trail has no edit or delete path for any role",
  "provenance": "DERIVED",
  "derived_from": "generated database types (audit rows: actor, action, target table, target id, before/after snapshots, server time), architecture document (append-only enforcement table), legacy audit service",
  "input": { "action_examples": ["void_session", "update_rate_config"] },
  "expected_output": {
    "row_shape": "actor, action name, target table and id, old snapshot, new snapshot, server-sealed instant",
    "visibility": "admin reviews; cashier actions produce entries the cashier cannot alter"
  },
  "state_transitions": [],
  "boundaries": [
    "insert-only: update and delete are denied to every role including admin",
    "voids and rate changes write their snapshots in the same transaction as the change they record"
  ],
  "reasoning": "The generated types define the row shape; the architecture document's guarantees table states the enforcement; the audit service shows the read path filtered to session actions in legacy — a limitation the rewrite widens to the full trail."
}
```

## vault-18 — Offline queue and replay

```json
{
  "id": "vault-18",
  "title": "Writes queue locally when offline and replay in order when connectivity returns; replay is idempotent and the server re-seals time",
  "provenance": "DERIVED (design) + OBSERVED caveat (dead wiring)",
  "derived_from": "legacy sync worker and its committed test (drain in chronological order, per-entry upsert keyed by id, continue past failures, status transitions), architecture document (queue design, duplicate detection, server overwrites queued timestamps), legacy audit notes (queue exists but nothing enqueues — dead code in legacy)",
  "input": { "queue": "entries with target table, payload, local timestamp, synced flag" },
  "expected_output": {
    "drain": "oldest-first; each entry replayed as an idempotent upsert on its id; a duplicate replay is a no-op",
    "on_entry_failure": "mark error status, continue with remaining entries, retry later",
    "on_success": "mark synced, update queue count and last-synced instant",
    "timestamps": "the server replaces any client-supplied instant at replay"
  },
  "state_transitions": ["entry: queued → synced", "sync status: idle → syncing → idle|error"],
  "boundaries": [
    "legacy caveat recorded for honesty: the queue infrastructure is fully built and tested, but no legacy write path ever enqueues to it — the legacy is effectively online-only. The rewrite decides the real offline contract in spec/offline-sync.md; where it differs from this fixture, the vault scenario is retired with a CHANGELOG entry, not silently diverged",
    "shift close is online-only regardless (vault-13)"
  ],
  "reasoning": "The sync worker's behavior is asserted by a committed legacy test; the dead-wiring caveat is the legacy audit notes' own finding. Both are recorded so the rewrite neither porting the deadness nor silently claiming parity."
}
```

## vault-19 — Roles and scope

```json
{
  "id": "vault-19",
  "title": "Two roles: a cashier sees and writes only the assigned branch; the admin sees all branches and alone voids and configures",
  "provenance": "DERIVED",
  "derived_from": "legacy role constants, auth flow (role and branch read from the staff profile table at session time), route guard (role-gated areas with per-role dashboards), architecture document RLS section (branch claim scoped policies; cashier read/insert only; admin full read; no cashier update/delete)",
  "input": { "roles": ["cashier", "admin"] },
  "expected_output": {
    "cashier": "reads and creates rows only in the assigned branch; cannot update or delete transactional rows; cannot see another branch's data at any layer",
    "admin": "reads all branches; voids with reason; edits per-branch rate configuration; manages staff accounts; reviews audit trail and shift history",
    "mechanics_caveat": "legacy resolves role and branch by reading a profile table with the authenticated id — the rewrite moves these to server-side authorization claims (app_metadata) per spec/authentication.md"
  },
  "state_transitions": [],
  "boundaries": [
    "cashier self-registration does not exist; staff accounts are created by the admin through a server function",
    "staff login accepts a bare identifier mapped to an internal address in legacy — a login-ergonomics detail, not an authorization rule"
  ],
  "reasoning": "Multiple legacy sources agree; the caveat marks where legacy mechanics are superseded by the new system's stricter model rather than carried forward."
}
```

## vault-20 — Rate configuration writes

```json
{
  "id": "vault-20",
  "title": "Rate configuration changes go through a merge RPC that preserves keys it does not own",
  "provenance": "DERIVED",
  "derived_from": "legacy rates service (documented RPC contract: merge the two owned sections, preserve every other key; direct table updates rejected as destructive to concurrent edits), rate configuration feature (canteen overrides blank-to-default; extension overrides validated against the server's acceptance rules), vault-07",
  "input": { "branch": "<branch id>", "canteen_overrides": "{item: price}", "extension_overrides": "{grace_minutes?, block_minutes?, charge_php?}" },
  "expected_output": {
    "merge": "the branch's config gains the submitted canteen and extension keys, keeps everything else untouched",
    "concurrency": "two admins editing different branches (or different keys) never clobber each other",
    "editor_guards": "values the server would silently replace are blocked at save time with a visible reason"
  },
  "state_transitions": [],
  "boundaries": [
    "room rates are NOT editable in legacy — the room-rate editor is a placeholder; the rewrite makes the full rate card configurable per branch (gap analysis)",
    "deleting an override reverts that item/parameter to the system default rather than storing an empty value"
  ],
  "reasoning": "The legacy service comment states the RPC contract and its concurrency rationale; the editor implements client-side validation mirroring vault-07."
}
```

---

## Plain-language mirror (for client sign-off)

| # | Scenario in business terms |
|---|---|
| vault-01 | A 3-hour short-time stay for two guests costs ₱450. |
| vault-02 | On short time, every guest beyond two adds ₱200: three guests ₱650, four ₱850, five ₱1,050. |
| vault-03 | Overnight (12 hours) is ₱1,100 for two guests, ₱1,400 for three, ₱1,700 for four; from five guests up, add ₱300 per extra guest (five = ₱2,000, six = ₱2,300). |
| vault-04 | The computer — not the cashier's watch — stamps the check-in time, and the booked end time is exactly 3 hours (short time) or 12 hours (overnight) later. |
| vault-05 | After the booked end, a guest gets a free 25-minute grace window; the desk sees a countdown. When it ends, the room shows as accruing charges — but no peso is charged until checkout. |
| vault-06 | Past grace, each started hour (or fraction of one) costs ₱150: 1 minute past → ₱150; a full hour → ₱150; one minute into the second hour → ₱300. |
| vault-07 | A branch can set its own grace minutes, block minutes, and block price. Bad settings (zero price, zero block, garbage numbers) are ignored and the system default (25 / 60 / ₱150) applies; the editor refuses to save values the server would ignore. |
| vault-08 | Canteen sales are recorded item by item with quantity (price × qty), cashier, branch, and server time. They are independent of room sessions. Each branch can override item prices; removing an override returns the item to the standard price list. |
| vault-09 | Room extras (towel ₱20, bed sheet ₱20, blanket ₱20, pillow ₱50, big foam ₱300, small foam ₱200) are charged to the guest's open session and appear in the final total. The ₱150 extension line can never be posted by hand — only checkout writes it. |
| vault-10 | Check-in records room, stay type, and guest count; the system seals the times, marks the room occupied, and the cashier confirms full payment first — no partial payment, no refunds. |
| vault-11 | Check-out is one server transaction: it stamps the time, adds every started extension hour owed (minus any already posted), computes the final total from base + surcharges + extras, and frees the room. |
| vault-12 | Only the admin can void a transaction, must write a reason, and the void is permanent and visible in the audit trail. Voided sessions don't count toward revenue. |
| vault-13 | A branch has one open shift at a time. Ending the shift locks in the expected cash (room + extras + canteen, attributed to when the money reached the desk). The cashier may enter the physically counted amount; expected minus counted is the variance, and a recorded count can never be changed. Ending a shift needs a connection. |
| vault-14 | While the shift runs, the desk sees running totals computed exactly the way the close will compute them — the close never surprises. |
| vault-15 | Rooms change status only by the system: occupied at check-in, grace/overdue as overstays age, vacant again at checkout. |
| vault-16 | Legacy already blocks a second open shift on the same branch, but it does NOT stop two cashiers from booking the same room — Silid must. |
| vault-17 | Everything important is written once to an audit trail no one — not even the admin — can edit or delete. |
| vault-18 | If the internet drops, entries queue on the desk computer and replay, in order and without duplicates, when the connection returns; the server re-stamps their times. (Recorded honestly: legacy built this but never wired it up; Silid defines the real contract.) |
| vault-19 | Cashiers work only inside their assigned branch; the admin sees all five branches and alone handles voids, rates, staff, and the audit trail. |
| vault-20 | Rate edits merge into the branch's configuration without erasing anything else, and two admins editing at once can't overwrite each other. |
