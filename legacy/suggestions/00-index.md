# MotelTrack — Upgrade Suggestions

Workflow-level upgrades proposed after a full read of the legacy codebase
(`/Silid/legacy`), ranked by impact on the owner's actual workflow — cash
accountability, revenue recovery, and visibility — not by implementation
effort. Cosmetic polish and anything the tool already does are deliberately
excluded. Each folder's `upgrade.md` is a standalone brief: current behavior
vs. new behavior, why it matters, a concrete implementation approach grounded
in the existing repo layout, risks, and a rough size.

| Rank | Upgrade | One-line summary | Brief |
|------|---------|------------------|-------|
| 1 | Shift cash reconciliation | A real end-of-shift close that freezes expected cash per cashier and flags variance at handover | [01-shift-cash-reconciliation](01-shift-cash-reconciliation/upgrade.md) |
| 2 | Recurring overstay billing | Extension charges repeat per elapsed block after grace, with room escalation and a desk alert | [02-recurring-overstay-billing](02-recurring-overstay-billing/upgrade.md) |
| 3 | Owner push alerts | Anomalies (voids, short shifts, stuck rooms, dead desks) pushed to the owner instead of pull-only dashboards | [03-owner-push-alerts](03-owner-push-alerts/upgrade.md) |
| 4 | Auto room assignment | Check-in suggests the first vacant room; a database constraint makes double-booking impossible | [04-auto-room-assignment](04-auto-room-assignment/upgrade.md) |
| 5 | Guest itemized receipt | A printable itemized receipt at checkout, rendered from server-stamped ledger values | [05-guest-receipt](05-guest-receipt/upgrade.md) |
| 6 | Payment capture | Record method (cash/GCash/bank) at the moment of collection so shift close can split the drawer from digital receipts — as revised by red team: deposits/balances dropped (they contradict the house pay-before-check-in policy) | [06-payment-capture](06-payment-capture/upgrade.md) |
| 7 | Daily owner digest | A nightly per-branch summary (revenue, voids, occupancy, variances) delivered automatically | [07-daily-owner-digest](07-daily-owner-digest/upgrade.md) |
| 8 | Canteen stock ledger | Stock-in / sales-out ledger with shrinkage visibility and low-stock alerts | [08-canteen-stock-ledger](08-canteen-stock-ledger/upgrade.md) |

## Cross-cutting notes

A few facts from the codebase affect several briefs, so they are recorded
here once:

- **`sessions.total` is never written — and neither are `base_rate` or
  `surcharges`.** The `close_session` RPC
  (`supabase/migrations/0010_remediate_rls_and_indexes.sql`) only flips
  status to `'closed'`; its own comment says total computation is "handled
  elsewhere," but nothing in the reviewed migrations or services computes it.
  Worse, `createSession` inserts only `room_id`, `booking_type`, and `pax`,
  so every money column on a session stays at its 0 default: the Edge
  Function `calculate-charge` and the client util
  `src/features/sessions/utils/charge.calculator.ts` exist but are never
  invoked anywhere. This server-side total fix is a shared prerequisite —
  build it once (brief 01) and briefs 02, 05, 06, and 07 all consume it.
- **No scheduled job actually runs.** Migration 0009 defines the flat
  grace-charge logic as an inline SQL function, but its `cron.schedule` call
  and the pg_cron extension setup are both commented out. The Edge Function
  `apply-grace-charge` is invoked by nothing and cannot deploy as written
  (it declares `charged` twice in one scope). Briefs 02, 03, and 07 each
  assume a working cron pattern exists — it does not; scheduling is
  net-new, and pg_cron cannot call an Edge Function without pg_net or a
  SQL HTTP wrapper.
- **The void flow is incomplete and currently impossible.** `voidSession`
  (`src/features/audit/services/audit.service.ts`) inserts an `audit_log`
  row but never marks the session itself voided — and migration 0010 removed
  every UPDATE policy on `sessions`, so no client path can set
  `status = 'voided'` at all. Void must become a SECURITY DEFINER RPC
  (brief 03's prerequisite; brief 01's expected-cash math depends on it).
- **Several front-desk screens are stubs** ("pending implementation"):
  cashier dashboard room grid, CheckInForm, CheckOutForm, ShiftSummaryPage,
  admin dashboard, and AuditLogPage. Briefs that touch those screens say so
  explicitly.
- **The offline queue is dead code.** `enqueueOfflineWrite`
  (`src/services/sync.service.ts`) and the Dexie `offline_queue` exist, but
  nothing in the app ever calls them, and the queue replays table upserts —
  not RPCs. Briefs must not assume offline writes "just work" (see the
  corrections in briefs 05 and 06).
- **Canteen sales are standalone.** `canteen_sales` (migration 0006) has no
  `session_id` column, so canteen items cannot appear on a session's
  receipt today (brief 05).
- **House policy pins the payment flow.** `docs/moteltrack-overview (1).md`
  requires full payment before check-in, forbids partial payments and
  deferred payment, and allows no refunds. Brief 06 was revised by red team
  accordingly: method capture at collection, no deposits/balances.
