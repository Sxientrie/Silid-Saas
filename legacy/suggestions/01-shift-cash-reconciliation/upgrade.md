# 01 — Shift close-out with expected-cash reconciliation

Introduce a real shift lifecycle: an explicit end-of-shift action that freezes
the expected cash on hand per cashier, records the physically counted amount,
and permanently stores the variance. This turns the shift summary from a
revenue list into the handover control that catches cash discrepancies at the
moment the responsible person is still standing at the desk.

## What it changes

**Current behavior.** The shift feature (`src/features/shift/`) is read-only
and computed entirely in the browser: `fetchShiftSummary`
(`src/features/shift/services/shift.service.ts`) queries `sessions`,
`canteen_sales`, and `session_addons` filtered by `cashier_id` and
"today at midnight" — not by any actual shift window — and sums the totals
client-side in JavaScript. There is no shift entity anywhere in the schema
(`supabase/migrations/`), no open/close event, no expected-cash snapshot, and
no record that a handover happened. The product docs
(`docs/moteltrack-overview (1).md`, "End-of-day cash reconciliation") call for
expected cash on hand per branch, but it is unimplemented.

**New behavior.** A `shifts` table with an explicit open/close lifecycle. The
cashier opens a shift and taps **End shift** at handover; a server-side RPC
computes and freezes the expected cash breakdown (room revenue, canteen,
add-ons) for that exact window — never trusting client-side sums. The incoming
cashier or admin records the physically counted amount; the system shows and
stores the variance. Admin gets a shift-history view with variances across all
branches.

## Why it matters

Cash leakage is the core problem this system exists to solve, and the handover
is where it happens. Today a shortfall is discovered hours later (or never);
with this, the discrepancy is surfaced at the exact moment the outgoing
cashier can still account for it, and every shift's expected-vs-counted number
is permanently attributable to a named person. It is also the data foundation
for the daily digest (brief 07) and the variance alert (brief 03).

## How to implement

1. **Schema** (new migration, next number in `supabase/migrations/`): a
   `shifts` table — `id`, `branch_id` FK, `opened_by` / `closed_by` FK
   `users(id)`, `opened_at` / `closed_at` TIMESTAMPTZ stamped server-side via
   trigger (pattern from migration 0004), expected-money columns
   (`expected_room`, `expected_canteen`, `expected_addons`, `expected_total`)
   NUMERIC NOT NULL DEFAULT 0, `counted_total` NUMERIC NULL,
   `variance` NUMERIC NULL, `status` CHECK ('open', 'closed'). RLS mirrors the
   cashier/admin policy patterns of migrations 0008/0010: cashiers
   insert/update only their own branch's rows, admin reads all. Scope the
   INSERT/UPDATE checks to the actor (`opened_by = auth.uid()`, in the style
   of 0010's `audit_insert_cashier`), not just the branch — a branch-scoped
   check alone would let one cashier close another's shift.
2. **RPC `close_shift(p_shift_id)`** — SECURITY DEFINER, following the
   `close_session` pattern in migration 0010. It computes expected totals
   server-side between `opened_at` and the close moment. One accounting-window
   decision must be made deliberately: room revenue should bucket by
   `checked_out_at` (money received during the window), canteen by `sold_at`,
   add-ons by `added_at` — all three differ from today's "today at midnight"
   filter, and voided sessions (`status = 'voided'`) must be excluded. Bucket
   by *when money reached the desk*, never by `sessions.cashier_id`: a guest
   checked in by cashier A but checked out during B's shift pays into B's
   drawer, so per-cashier expected cash must follow the close moment, or
   multi-cashier branches will reconcile against the wrong person.
3. **Close the `sessions.total` gap first.** Nothing in the reviewed
   migrations or services ever writes `sessions.total` — `close_session`
   (migration 0010) only flips status, and session creation leaves the default
   0. Worse, `createSession` inserts only `room_id`, `booking_type`, and
   `pax`, so `base_rate` and `surcharges` also stay at their 0 defaults: the
   Edge Function `calculate-charge` and the client util `charge.calculator.ts`
   both exist but are never invoked anywhere. The shift summary today would
   sum zeros. Computing the final total server-side at close (base rate + pax
   surcharge + posted add-on rows, including extension charges) is a
   prerequisite; briefs 02 and 05 need the same fix — build it once here.
4. **UI.** `src/pages/cashier/ShiftSummaryPage.tsx` gains open-shift state and
   an End Shift button (use the existing
   `src/components/shared/ConfirmDialog.tsx`); replace `fetchShiftSummary`'s
   client-side sums with the RPC result. A shift-history + variance view goes
   under `src/pages/admin/`.
5. **Offline rule.** End-shift should be online-only — show a clear blocking
   message when offline (detection already exists via
   `src/hooks/useOnlineStatus.ts`). Closing a shift while writes are still in
   the Dexie queue (`src/services/sync.service.ts`) would freeze wrong totals.
6. **Open question to settle with the owner:** how shifts map to reality
   (fixed schedules vs. ad hoc). Default to ad hoc open/close per cashier; if
   a cashier forgets to close, either auto-close after N hours or close
   implicitly when the next cashier's first action lands — pick one fallback
   and document it. A second decision hides here: whether one branch may have
   overlapping open shifts. Overlapping windows would assign the same checkout
   revenue to two shifts, so enforce one open shift per branch unless the
   owner says otherwise.

## Risk / tradeoff

The control only works with discipline: if cashiers skip End shift, windows
blur and totals lose meaning (hence the auto-close fallback). Recording the
counted cash adds a minute of friction at handover. The revenue-bucketing rule
(checkout time vs. check-in time) shifts a peso between shifts at boundaries —
decide once, document it, never change it retroactively. And expected cash is
only as good as the void story: migration 0010 removed every UPDATE policy on
`sessions`, so today no client can mark a session voided at all — until void
becomes an RPC (brief 03's prerequisite), the expected-cash query has no
voided rows to exclude, and any void capability added later must land before
this brief's numbers can be trusted.

## Rough size

Medium — one table, one RPC, RLS policies, UI changes on two pages. No new
infrastructure; the offline constraint is a UX rule, not a build item.

## Red-team verdict

**survives.** Verified against disk: `fetchShiftSummary` does filter by
calendar day and sum client-side (`src/features/shift/services/shift.service.ts`);
there is no shift entity in any migration; the docs' expected-cash user story
exists (`docs/moteltrack-overview (1).md`, "End-of-day cash reconciliation");
`sessions.total` is genuinely never written. Fixes applied: added the
money-reaches-the-desk attribution rule (multi-cashier handovers), noted that
`base_rate`/`surcharges` are also never populated, scoped the RLS checks to
the actor, flagged the overlapping-shift decision, and added the void deadlock
(0010 removed all sessions UPDATE policies) to the risks.
