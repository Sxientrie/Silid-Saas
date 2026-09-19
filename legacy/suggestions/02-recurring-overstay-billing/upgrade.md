# 02 — Recurring overstay billing with escalation

Make extension charges recur per elapsed time block after the grace period,
escalate the room's status on long overstays, and surface a persistent alert
to the front desk — instead of today's flat-once charge logic, which (as the
code stands) is not even scheduled to run.

## What it changes

**Current behavior.** The flat-charge logic exists in two places, and
neither runs on a schedule today. Migration 0009 defines an inline SQL
function `apply_grace_charges()` that finds active sessions past
`booked_end_at` plus the 25-minute grace (`GRACE_PERIOD_MINUTES`,
`src/constants/grace.constants.ts`) without an `extension_charge` row,
inserts exactly ONE ₱150 charge, and sets the room status to `'grace'` — but
its `cron.schedule('apply-grace-charges', '* * * * *', ...)` call is commented
out, as is the pg_cron extension setup. The Edge Function
`supabase/functions/apply-grace-charge/index.ts` implements the same
flat-once logic but nothing invokes it, and it would not even deploy as
written (it declares `charged` twice in the same scope). So in practice
overstay charging is entirely absent unless someone manually triggers the
function; even when the flat charge did run, a guest 6 hours over would
generate the same ₱150 as one 30 minutes over, and no surface keeps telling
the desk. The client hook `useGracePeriod`
(`src/features/sessions/hooks/useGracePeriod.ts`) only counts down the
25-minute window and then reports nothing.

**New behavior.** Extension charges recur on a defined block — e.g. ₱150 per
started hour after grace, configurable per branch. Each block posts its own
append-only `session_addons` row. Rooms escalate (grace → overdue) after a
threshold, and the room grid / active-session list shows a persistent badge
for any overstay. Once checkout computes totals from posted add-on rows
(brief 01's `close_session` fix, or this brief's step 3), every posted
extension row flows into the guest's final total automatically.

## Why it matters

Direct revenue recovery: long overstays currently leak everything past the
first ₱150. It also restores room turnover — an unbounded overstay quietly
removes a room from sale. And it closes an accountability hole: noticing
overstays is manual judgment today, which is exactly the kind of judgment the
system was built to remove from the cashier's hands.

## How to implement

1. **Define the block rule** in `src/constants/grace.constants.ts` and as a
   per-branch override via `branches.rate_config` (JSONB, migration 0001;
   managed through `src/features/rates/`): `extension_block_minutes` and
   `extension_charge_php`. The existing `RateConfigFeature` save path spreads
   and preserves unknown `rate_config` keys (it only edits `canteen`
   prices), so new keys survive a save — but they need their own editor or a
   seeded default, since no UI writes them today.
2. **Rework `apply-grace-charge` to be stateless and idempotent.** Instead of
   "has any extension_charge → skip", compute
   `blocks_elapsed = floor((now − booked_end_at − grace) / block)` and
   `charges_posted = count(existing extension rows)`, then insert the
   difference. Deriving everything from `booked_end_at` each run means a cron
   re-fire can never double-charge — do NOT track "last charged at" state
   that can drift. Charge per completed block; the cron runs at minute
   granularity (0009's commented schedule is `'* * * * *'`), so a block posts
   within a minute or two of becoming due, which is acceptable. Note this
   step also means scheduling the job for real: uncomment/recreate the
   `cron.schedule` call (and enable pg_cron), since neither exists today.
3. **Alternative architecture, consider seriously:** compute all extension
   money in one place at checkout (inside `close_session`, migration 0010 —
   which must gain total computation anyway; see brief 01) and reduce the
   cron job to room-status escalation + desk alerting only. One owner of the
   arithmetic; never both. The cron-only-for-alerts variant is easier to make
   exactly right and keeps money math in one transaction.
4. **Room escalation.** `rooms.status` has a CHECK constraint ('vacant',
   'occupied', 'grace' — migration 0003). Either extend the constraint with
   `'overdue'` or drive escalation off session data without touching the
   constraint; prefer the latter if the room grid is the only consumer.
5. **Desk alerting.** A badge on the active-session list / room grid
   (`src/pages/cashier/DashboardPage.tsx` — currently a stub, so this lands
   with that screen's real implementation). `CountdownTimer`
   (`src/components/shared/CountdownTimer.tsx`) already covers the pre-grace
   countdown.
6. **Migration cutover:** sessions already past grace carrying the legacy flat
   charge — apply the new rule only to sessions checked in after deploy.

## Risk / tradeoff

Guest-facing dispute risk: escalating charges need a clear published rule at
the desk (rate card, signage) or cashiers will absorb the argument in person.
The docs' own rate card ("Extension: +1 Hour ₱150") already implies per-hour
recurrence, so aligning the block with the published card is defensible; any
other block size changes the published policy and needs the owner's sign-off.
This is the highest-stakes money-path edit in this list — a non-idempotent
version double-charges guests, which is worse than the current undercharge.
The block-boundary math deserves adversarial tests: exactly on the boundary,
cron firing twice in a row, session closing mid-run. Also decide who resets
`rooms.status` back to `'vacant'` at checkout: nothing does so today (the
client-side `updateRoomStatus` has no callers), so a recurring job that keeps
flipping rooms to `'grace'` needs a matching checkout transition or the room
grid will be permanently wrong.

## Rough size

Medium — one edge function rework (or checkout-RPC extension), constants/DB
config, small UI surfacing. The correctness effort dominates the code volume.

## Red-team verdict

**survives** (after corrections to its factual base). The recurring-block
design, the count-based idempotency, and the "cron for alerts only"
alternative are all sound. But the brief's "Current behavior" was wrong about
the trigger chain and has been rewritten: migration 0009's `cron.schedule` is
commented out (nothing is scheduled at all), the flat-charge logic lives in
an inline SQL function in 0009 rather than being "scheduled by pg_cron" from
the Edge Function, and the Edge Function itself cannot deploy (duplicate
`charged` declaration). Also fixed: the "5-minute cron granularity" claim
(the commented schedule is every minute), the "checkout totals naturally
include" line (totals are not computed anywhere — now explicitly dependent on
brief 01's fix), plus added rate_config editor caveat, the published-rate-card
alignment point, and the missing room-status-reset-at-checkout risk.
