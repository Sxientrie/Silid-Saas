# 07 — Automated daily owner digest

Every night, compile the prior day per branch — revenue by source, sessions,
occupancy, voids, cash variances, unpaid balances — and send it to the owner
automatically, so the owner starts each morning with the numbers instead of
calling a branch or opening the app.

## What it changes

**Current behavior.** No reporting exists at all. The closest thing, the
"today" shift summary (`src/features/shift/services/shift.service.ts`), is
never rendered anywhere — the Shift Summary page
(`src/pages/cashier/ShiftSummaryPage.tsx`) is a stub — and it sums
`sessions.total`, which nothing ever writes. Historical revenue
reports ("daily, weekly, and monthly revenue summaries per branch" in
`docs/moteltrack-overview (1).md`) are unimplemented, the admin dashboard is a
stub, and the owner's default source of truth is a phone call.

**New behavior.** A scheduled job compiles the prior day per branch: revenue
by source (room / add-ons / canteen), session count and occupancy rate, voids
with reasons and actors, canteen top sellers, cash variance from shift closes
(brief 01), and money collected by method (brief 06, as revised: method
capture at check-in — under the house's pay-before-check-in policy there are
no unpaid balances to report). Delivered via the
same channel as the push alerts (brief 03). Zero actions required from anyone
at the branches.

## Why it matters

Gives the owner a daily reconciliation habit with zero effort: each morning's
digest is the baseline that makes anomaly alerts (brief 03) meaningful —
today's number means something because yesterday's number arrived. It removes
the "call the branch" step entirely and starts building the historical series
the docs ask for when making staffing and pricing decisions.

## How to implement

1. **Sequencing.** Ship after brief 03 (shares the notification transport)
   and brief 01 (variance data); it degrades gracefully — sections whose
   prerequisites don't exist yet are simply omitted.
2. **Function.** `supabase/functions/daily-digest/index.ts` on pg_cron (e.g.
   06:00 Asia/Manila — `cron.schedule` accepts a timezone parameter). Mind
   the wiring: migration 0009's `cron.schedule` call is commented out, so
   there is no working pattern to copy, and pg_cron cannot invoke an Edge
   Function directly — scheduling it needs pg_net (HTTP from SQL) or a SQL
   wrapper that performs the call. Do the
   aggregation in Postgres — a view or aggregate queries — not in JS loops.
3. **Occupancy is the one non-trivial metric.** Occupied room-hours requires
   the interval overlap between each session's
   `[checked_in_at, checked_out_at]` and the day window: overnight sessions
   span midnight, so clip intervals to the window (timestamp-range
   intersection) rather than counting sessions that merely touch the day.
   Capacity comes from the `rooms` table.
4. **One source of truth.** Money figures must come from the same SQL the
   shift reconciliation uses (brief 01) — ideally both read one shared view —
   or the digest and the shift report will disagree by a peso someday and
   erode trust in both.
5. **Delivery.** Same Telegram/email path as brief 03; compact text, one
   section per branch.

## Risk / tradeoff

Low. The two care points: numbers must match what the owner can see in-app to
the peso (hence shared queries), and the interval-overlap occupancy SQL is the
only subtle piece — test it against a session that spans midnight and one
that spans multiple days.

## Rough size

Small–medium given briefs 01 and 03 exist — the function is mostly SQL plus
formatting.

## Red-team verdict

**survives.** The design is the right shape: shared SQL with shift
reconciliation (step 4), interval-overlap occupancy with midnight-clipping
(step 3), and graceful degradation when prerequisites are missing (step 1).
The docs citation ("daily, weekly, and monthly revenue summaries per branch")
is real. Fixes applied: the shift summary it calls "live" is never rendered
and sums a column that is never written — there is currently no reporting at
all; the "migration 0009 shows the cron pattern" claim was wrong (schedule
commented out, pg_cron needs pg_net to reach an Edge Function); and the
"outstanding unpaid sessions (brief 06)" line was rewritten, because brief 06
was revised to method-capture-at-check-in and the house policy
(pay-before-check-in, no partial payments) means unpaid balances should not
exist as a report line.
