# 08 — Canteen stock ledger with shrinkage visibility

Track canteen inventory per branch: restocks in, sales out, current stock,
low-stock alerts — and, as a result, visibility into shrinkage (sold vs.
stocked) per item.

## What it changes

**Current behavior.** Canteen sales (`src/features/canteen/`, table from
migration 0006) record quantities sold, but there is no inventory concept:
nothing records stock-in, nothing deducts, nothing flags low stock. The item
catalogue is a hardcoded constant list (`CANTEEN_ITEMS` in
`src/constants/canteen.constants.ts`) with per-branch price overrides via
`branches.rate_config` under a `canteen` key (applied in
`src/features/canteen/components/CanteenFeature.tsx`); sale rows store the
constant item id in `canteen_sales.item` (TEXT), so stock rows keyed to the
same ids join cleanly against existing sales. The owner cannot see
that 48 Red Horses sold but only 40 were restocked.

**New behavior.** Per-branch stock levels per item. Restocks are entered as
stock-in movements; every sale posts a stock-out movement server-side; the
canteen page shows current stock and low-stock badges against per-item
thresholds, and the owner can compare total sold vs. total stocked —
shrinkage per item per branch becomes visible.

## Why it matters

The canteen is a second cash-and-goods leak surface the tool currently covers
only on the money side. Stock moving out without a matching restock is
invisible today. Low-stock alerts also stop the desk selling what isn't on the
shelf. This is a capability owners rarely think to ask a front-desk billing
system for, and it reuses the sale data the system already captures.

## How to implement

1. **Schema** (new migration): `canteen_stock` (`branch_id`, `item_id`,
   `qty_on_hand`, `low_stock_threshold`, `UNIQUE (branch_id, item_id)`) and
   `canteen_stock_movements` (append-only: direction in/out, qty, item,
   branch, source reference — sale id or restock entry — actor, server-stamped
   timestamp). Movements follow the `audit_log` discipline: INSERT/SELECT
   only.
2. **Post stock-out server-side.** A trigger on `canteen_sales` INSERT (or
   fold into a sale RPC) so a sale and its deduction are atomic — never two
   independent client writes. Make the movement idempotent on the sale id
   (a unique index on the movement's source reference) so a replayed write
   cannot deduct twice. Allow `qty_on_hand` to go negative: a sale must
   never be blocked by stale stock data; treat negatives as a
   "recount the shelf" prompt, not an error.
3. **Restock entry.** A small form (admin, or cashier with admin visibility)
   — item, quantity, optional unit cost — writing an 'in' movement. This is
   the new chore; keep it to a few seconds.
4. **Surfacing.** Stock list + low-stock badges on the canteen page
   (`src/features/canteen/components/`); low-stock events can feed the
   brief-03 alert channel once it exists.
5. **Catalogue caveat.** Item ids come from a compiled constant; real stock
   management eventually wants the catalogue in a table (per-branch items,
   editable, cost prices). Scope decision: key stock rows to the existing
   constant ids now (works immediately) and note catalogue-as-table as a
   follow-up. Record restocks in sale units (bottles, not cases) so the
   arithmetic stays trivial.

## Risk / tradeoff

Restock entry is a recurring chore that gets skipped under pressure, and the
shrinkage math dies the moment stock-ins stop being recorded — the ledger
degrades gracefully to sales-only, still useful but no longer a shrinkage
detector. The hardcoded catalogue limits item lifecycle (new/delisted items)
until it moves to a table.

## Rough size

Medium — two tables, a trigger, one small form, list surfacing.

## Red-team verdict

**survives.** Every structural claim checked out: migration 0006 has no
inventory concept, `CANTEEN_ITEMS` is a compiled constant, and the
per-branch price override via `branches.rate_config.canteen` is real
(`CanteenFeature.tsx` reads `rate_config.canteen[item.id]`; sale rows store
the constant id, which the brief's keying strategy matches). Sales are
logged as one row per cart item, so the movement ledger's in/out arithmetic
is straightforward. Fixes applied: added the idempotency requirement on the
stock-out movement (unique source reference) so replays can't double-deduct,
and clarified how the constant ids join to existing sale data. The docs file
places "Canteen inventory tracking and low-stock alerts" in Phase 2, which
supports rather than contradicts the proposal. The skip-the-restock-chore
risk is correctly identified as the failure mode.
