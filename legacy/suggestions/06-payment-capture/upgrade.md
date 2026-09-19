# 06 — Payment capture: method, deposit, balance

Record what was actually collected, how, and when — an append-only payments
ledger with method (cash, GCash, bank), deposits during a session, and
outstanding balances at checkout — so the ledger distinguishes money owed from
money received.

## What it changes

**Current behavior.** The system records what a guest *owes* (`sessions.total`
once brief 01's total-computation gap is closed, `session_addons`,
`canteen_sales`) but never what was *collected* or how. There is no payments
concept anywhere in the schema; every amount is implicitly cash-at-desk, and
shift reconciliation (brief 01) cannot separate the cash drawer from digital
receipts.

**New behavior.** An append-only `payments` ledger. At checkout the desk
records the payment: amount + method (+ optional reference, e.g. GCash ref
number). Deposits or partial payments can be recorded at any point during a
session. The checkout screen shows the outstanding balance, and shift close
(brief 01) reports expected cash per method — the drawer number becomes a
cash-only number, which is the only number that can actually be short.

## Why it matters

Without payment records, reconciliation proves what was billed, not what was
received — and digital money can't be pocketed the way cash can, so separating
methods makes variance analysis far sharper. Deposits also collect money at
check-in time instead of trusting it to appear at check-out, which matters in
a no-refund business. Owners rarely ask for this explicitly because today's
ledger looks complete on the billing side.

## How to implement

1. **Schema** (new migration): `payments` table — `id`, `branch_id`,
   `session_id` NULL (a canteen-only sale can be paid without a session),
   `cashier_id`, `amount` NUMERIC with `CHECK (amount > 0)`, `method` TEXT
   CHECK against a fixed list (start: cash, gcash, bank),
   `paid_at` TIMESTAMPTZ stamped server-side via trigger (pattern from
   migrations 0004/0006), `reference` TEXT NULL. Append-only: INSERT/SELECT
   grants only — no UPDATE/DELETE policies, mirroring the `audit_log`
   discipline; corrections go through the void flow with a reason.
2. **RPC `record_payment`** — SECURITY DEFINER, sealing cashier identity and
   server time server-side; never accept `paid_at` from the client.
3. **Checkout flow.** After `close_session`, the checkout UI records
   payment(s) against the session total and shows remaining balance
   (balance = session total + add-ons + linked canteen − sum of payments).
   Keep it one screen and one confirm — this adds a desk step and must stay
   fast.
4. **Change-giving policy.** If the guest hands ₱1,000 for a ₱950 bill, either
   record ₱950 received (what was kept) or ₱1,000 in + ₱50 change-out. Pick
   one convention — recommend record-what-was-kept, simplest to reconcile —
   and document it.
5. **Offline.** Payment writes cannot lean on the Dexie sync path as-is:
   `enqueueOfflineWrite` (`src/services/sync.service.ts`) exists but has no
   callers, so the queue is never fed — and its upsert replay targets plain
   tables, not RPCs. Either build real offline replay for payments or make
   payment recording online-only, explicitly.
6. **Dependency.** Brief 01 consumes per-method totals; land 01 first (or
   ship 01 with a cash-only assumption and refine).

## Risk / tradeoff

Adds a step at the desk, and the failure mode is cashiers skipping it — which
shows up as sessions with no payment row. Mitigate by making checkout refuse
to complete without a payment record, or an explicit "unpaid" escape hatch
that is itself visible to the admin. The method list is business-specific;
confirm the real list (GCash vs. Maya vs. bank) with the owner before locking
the CHECK constraint.

## Rough size

Medium — one table, one RPC, RLS policies, and a checkout UI change.

## Red-team verdict

**revise.** The append-only payments ledger and method capture are sound and
genuinely missing — but the brief's deposits/balances half collides with the
documented house policy, and its flow placement is backwards for this
business:

1. **The policy conflict is disqualifying as written.**
   `docs/moteltrack-overview (1).md` states, three separate times, that
   "Full payment is collected before any guest is allowed to check in — no
   exceptions, no partial payments," that "The system requires the cashier to
   confirm full payment has been collected before a check-in can be
   completed. There is no deferred payment option," and that the business is
   strictly no-refund. Under that policy deposits, partial payments, and
   outstanding balances never legitimately exist — the brief's "New behavior"
   ("Deposits or partial payments can be recorded at any point during a
   session") would institutionalize a policy violation, and its "Why it
   matters" argument for deposits ("collect money at check-in time instead of
   trusting it to appear at check-out") solves a problem the house rules
   already solve by fiat.
2. **The flow placement contradicts the policy.** Step 3 records payment
   "after `close_session`" at checkout, but under pay-before-check-in the
   money moves at check-in. A payments ledger that only fills in at checkout
   records nothing while the cash is actually handed over.
3. **What survives is worth building.** Recording the method (cash vs. GCash
   vs. bank) and reference at the moment of collection — at check-in, per
   policy — is exactly what brief 01's reconciliation needs to split the
   drawer from digital receipts, and it requires no policy change. The schema
   (step 1), the `record_payment` RPC (step 2), and the change-giving
   convention (step 4) carry over as-is; the checkout-balance screen and
   deposit language should be cut or gated behind an explicit owner decision
   to change the house policy.

Also fixed inline: step 5 claimed payment writes "work as-is" through the
Dexie sync path, but nothing ever feeds that queue (`enqueueOfflineWrite` has
no callers) and it cannot replay RPCs — corrected. Revise the brief around
check-in-time method capture before this is scheduled; as written it duplicates
brief 01's checkout step and legislates against the owner's own stated rules.

## Dependencies discovered during implementation (shift/overstay red-team, September 2026)

Implementing briefs 01 and 02 surfaced a gap this brief must close: under the
house's pay-before-check-in policy, the cash collected at check-in has no
ledger record — the session row proves the stay, not the money. Consequence
today: when an **active** session is voided, the guest's payment sits in the
drawer but appears in no shift's expected total, so reconciliation shows a
phantom overage the system cannot explain. The frozen shift snapshots in
brief 01 are correct as designed; the missing piece is the payment record
this brief introduces. When this brief lands: record a payment at check-in
(not only at checkout, since collection happens before the stay), and the
void path must reconcile any recorded payments for the voided session into
the audit trail. Until then, brief 01's reconciliation intentionally
under-counts voided check-ins' cash; treat unexplained overages alongside
recently voided active sessions as the known signature of this gap.
