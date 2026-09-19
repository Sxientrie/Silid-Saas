# 03 — Push alerts to the owner

Watch for defined anomalies and push them to the owner's phone, instead of
today's pull-only model where problems surface only if the owner opens the
app and looks. This is the mechanism that finally delivers the product's
stated goal: catching problems "as they happen, not hours later."

## What it changes

**Current behavior.** All oversight is manual, and there is barely anything
to look at: the admin dashboard
(`src/pages/admin/DashboardPage.tsx`) and the audit log page
(`src/pages/admin/AuditLogPage.tsx`) are both stubs pending implementation.
Nothing proactive ever leaves the system. The product docs
(`docs/moteltrack-overview (1).md`, "Anomaly visibility") list flagged
suspicious entries as an admin story; it is unimplemented.

**New behavior.** A small rules engine that detects high-value anomalies and
pushes a notification: a transaction voided; a shift closed with variance
beyond a threshold (depends on brief 01); a room stuck in grace/overdue
beyond X minutes (relates to brief 02); a branch desk offline or its offline
queue not drained for Y minutes; optionally, revenue deviating sharply from
the branch's baseline. Delivery via Telegram bot or email — both callable
from a Supabase Edge Function with no new infrastructure.

## Why it matters

Voids, dead desks, and short shifts are exactly the anomalies that are
invisible unless someone goes looking — and the owner's current default is to
not be looking. This converts the append-only audit ledger from a historical
archive into an active control, which is the difference between recording
misconduct and preventing it.

## How to implement

1. **Prerequisite — fix void first.** `voidSession`
   (`src/features/audit/services/audit.service.ts`) inserts an `audit_log`
   row but never marks the session itself `'voided'`, so "a void happened"
   is not reliably detectable today. Make void an RPC that voids the session
   and writes the audit row atomically (SECURITY DEFINER, pattern of
   `close_session` in migration 0010), then alert on it.
2. **Detection.** New edge function
   `supabase/functions/check-anomalies/index.ts` on pg_cron (every 5–15
   minutes). Mind the wiring: migration 0009's `cron.schedule` call is
   commented out, so there is no working pattern to copy, and pg_cron cannot
   invoke an Edge Function directly — scheduling it requires pg_net (HTTP
   from SQL) or a SQL wrapper that performs the call. Each rule is a
   parameterized SQL query over `sessions` / `canteen_sales` / `audit_log` /
   `shifts`. Thresholds start as constants; promote to a config table only
   when the owner asks to tune them.
3. **Idempotent alerting.** Keep a notified-events table (or derive
   uniqueness from event ids) so the recurring cron does not re-alert the
   same anomaly every run; re-alert only on state change (e.g., the variance
   grew).
4. **Delivery.** Telegram Bot API via plain `fetch` from the edge function
   (free, no vendor lock) or email via a transactional provider; secrets via
   Supabase secrets (`Deno.env`), matching the existing function pattern in
   `apply-grace-charge`.
5. **Dead-desk detection.** The app tracks client-side online status
   (`src/hooks/useOnlineStatus.ts`) and has offline-queue machinery
   (`src/services/sync.service.ts`, Dexie schema in `src/lib/dexie.ts`) —
   though nothing in the current code ever calls `enqueueOfflineWrite`, so
   the queue is dead weight today. Dead-desk detection is net-new either way:
   add a lightweight periodic `last_seen` heartbeat per branch desk and alert
   when it ages past the threshold.
6. **Open question:** which channel the owner actually reads (Telegram, SMS,
   email). Start with Telegram/email — SMS costs per message and adds a
   provider.

## Risk / tradeoff

Alert fatigue is the failure mode: false positives train the owner to ignore
the channel, after which even real alerts are worthless. Start with few,
high-precision rules (voids, dead desk, shift variance) and widen only once
precision is proven. Adds a dependency on a third-party messaging API.

## Rough size

Medium — one cron function, a handful of rules, notification transport, plus
the void fix as a prerequisite.

## Red-team verdict

**survives.** The rules-first, few-and-precise approach is right, and the
void-fix prerequisite is correctly identified (`voidSession` writes only an
`audit_log` row; migration 0010 removed every sessions UPDATE policy, so
nothing can actually void a session — an RPC is the only way). Fixes applied:
the audit log page is also a stub (the brief implied it shows data), the
"migration 0009 shows the wiring" claim was wrong (schedule commented out;
pg_cron needs pg_net to reach an Edge Function), and the offline queue is
never fed so dead-desk detection cannot lean on it. Nothing was found that
kills the proposal; alert-fatigue remains the dominant risk and is already
addressed.
