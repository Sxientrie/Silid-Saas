# 05 — Guest-facing itemized receipt at checkout

Give the desk a printable, itemized receipt at checkout — rendered from the
server-stamped ledger values, printed through the browser — so the guest sees
and keeps the number while still at the front desk.

## What it changes

**Current behavior.** Checkout closes the session via the `close_session` RPC
(migration 0010), which only flips status to `'closed'` and does not compute a
final total — its own comment says the total is "handled elsewhere," but
nothing in the reviewed migrations or services computes it (the client-side
calculator `src/features/sessions/utils/charge.calculator.ts` is never
invoked anywhere, and `createSession` never writes `base_rate`, `surcharges`,
or `total`).
There is no receipt anywhere in the system; the guest gets nothing or a
handwritten slip. The checkout screen
(`src/features/sessions/components/CheckOutForm.tsx`) is a stub.

**New behavior.** At checkout, the desk prints an itemized receipt: branch
name, room, booking type, pax, base rate, pax surcharge, each posted
extension/overstay charge with its time, linked canteen items if any, grand
total, cashier name, server-stamped timestamps, and a per-branch receipt
number. Rendered from ledger rows only (never client math), printed via the
browser's print dialog with print-specific CSS — no new hardware required.

## Why it matters

The business is no-refund and airtight-cash by philosophy; a printed itemized
slip is its strongest dispute defense, because the guest saw and kept the
figure while still present. It removes a manual step (handwritten receipts),
and itemization is what makes the extension charges from brief 02 explainable
at the desk instead of arguable.

## How to implement

1. **Prerequisite — server-side total.** Extend `close_session` (migration
   0010) to compute base + surcharge (mirroring the booking constants that
   `supabase/functions/calculate-charge/index.ts` uses) plus the sum of
   posted `session_addons`, and write `sessions.total` in the same
   transaction. The receipt must render DB values only.
2. **Receipt numbering.** Add a per-branch receipt sequence (small counter
   table bumped inside the checkout RPC) so receipts are gapless per branch —
   gapless numbering is itself an anti-tamper feature. Bump the counter
   inside the same transaction with a row lock (`SELECT ... FOR UPDATE`) so
   two concurrent checkouts cannot draw the same number.
3. **Component.** New `ReceiptView` in
   `src/features/sessions/components/`; fetch session + addons (+ linked
   canteen) at checkout; add `@media print` rules to
   `src/styles/globals.css` (or a dedicated print stylesheet) that hide the
   app chrome and show only the receipt.
4. **Canteen linkage caveat.** `canteen_sales` (migration 0006) has no
   `session_id` column — sales are standalone, so canteen items can only
   appear on a receipt if linkage is added (nullable `session_id` column,
   set when the desk attaches a sale to a session). Either add that column in
   this upgrade or ship the receipt room-charges-only first and state the
   limitation on the slip.
5. **Offline.** Checkout cannot actually happen offline in the current code:
   `closeSession` calls `supabase.rpc()` directly and nothing ever calls
   `enqueueOfflineWrite`, so the Dexie queue is empty by construction — and
   even if it were fed, it replays table upserts, not RPCs. Treat checkout
   like brief 01 treats end-of-shift (online-only, with a blocking message
   via `src/hooks/useOnlineStatus.ts`), or build real RPC replay as its own
   piece of work. Do not "print from the local values": a slip whose grand
   total was never computed server-side contradicts this brief's own
   "render DB values only" rule.

## Risk / tradeoff

Little risk in the receipt rendering itself. The risk lives in the
prerequisites: without brief 01's server-side total there is nothing
truthful to print, and the receipt-numbering counter must be transactionally
locked or concurrent checkouts will collide. The only real scope decision is
whether canteen linkage (a schema change) is included now or the receipt
starts room-charges-only.

## Rough size

Small for the receipt component + print CSS; medium once the prerequisites it
rightly deserves are included: server-side total computation, receipt
numbering, and (optionally) canteen linkage.

## Red-team verdict

**survives.** All structural claims verified: `close_session` only flips
status and its "handled elsewhere" comment is real (migration 0010);
`sessions.total`, `base_rate`, and `surcharges` are never written by anything;
`canteen_sales` (migration 0006) has no `session_id`; CheckOutForm is a stub.
The DB-values-only design and the canteen-linkage caveat are right. Fixes
applied: the offline claim was wrong (nothing feeds the offline queue and it
cannot replay RPCs — rewritten as online-only checkout), the calculator is
dead code rather than "display-only", the receipt counter needs a row lock,
and "essentially none" risk was corrected to point at the real prerequisites.
