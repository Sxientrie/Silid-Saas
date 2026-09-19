# Offline-Sync Architecture

The Frontdesk is an offline-first PWA: desk machines keep working through
connectivity outages, queue what the server has not confirmed, and replay
it — in order, without duplicates — when the connection returns. This file
defines the contract. The scope decision keeps offline-first in v1
(`spec/project-overview.md`), driven by branch-site outages; if the client
confirms branch connectivity is reliable, this is the first scope item to
cut, and the contract below is what would be cut.

The legacy's honesty caveat shapes this file: legacy built a full queue
and sync worker, unit-tested the drain, and never wired any write path to
it — its day-one behavior was online-only with local read caches (vault-18,
`spec/legacy-gap-analysis.md` §3.4). Silid defines the real contract and
proves it with network-throttled E2E tests; the vault fixture carries the
caveat and is retired through a CHANGELOG entry only if the real contract
diverges from it — never silently.

## 1. The local layer

- **Dexie (IndexedDB)** is the local database on every desk machine,
  owning three concerns:
  1. **Read cache** — master data the desk needs to render and price
     without the network: rooms, the branch's rate configuration,
     catalogue prices.
  2. **Outbox (write queue)** — every write the server has not confirmed,
     as a durable record with its target procedure, payload, a client
     -generated idempotency key, and the local enqueue instant.
  3. **Session mirror** — active sessions and their timestamps, so the
     overstay ladder keeps computing while offline (display math is pure
     and local by design; `spec/domain-rules.md` §3).
- **Serwist** is the PWA service worker: app-shell precaching so the desk
  boots without the network, plus runtime caching for static assets.
- **The power reality** (UPS + generator rule) means true offline windows
  are expected to be short and rare — the offline layer is a safeguard
  with the same correctness bar as the online path, not an afterthought,
  but also not the primary data path.

## 2. The write contract

1. **Every state-changing desk action is attempted online first.** The
   remote service calls its tRPC procedure; on success the confirmed
   server row (with its sealed timestamps and server-computed money)
   replaces any local copy.
2. **On network failure the action lands in the outbox** — durably, before
   the UI reports anything. The desk shows a queued indicator; the cashier
   keeps working normally. Nothing is lost on a crash or power cut between
   action and queueing.
3. **Replay is ordered and idempotent.** The drain runs oldest-first and
   carries each entry's idempotency key; a retried replay can never
   duplicate a row (the server upserts/coalesces on the key). The server
   re-seals time at replay: the local enqueue instant is metadata, never
   an authoritative timestamp (Invariant 2a) — replayed check-ins are
   stamped when the server accepts them.
4. **Failures do not block the queue.** One poisoned entry marks itself
   errored and the drain continues; the desk surfaces stuck entries rather
   than stalling silently (vault-18's drain behavior, now actually wired).
5. **Server-computed money wins.** A replayed action's authoritative
   figures are whatever the server computes at replay time from the
   branch's current configuration — the outbox stores the action's
   inputs, never amounts (`spec/domain-rules.md` §7).

## 3. What is online-only by design

- **Shift close** (`spec/domain-rules.md` §8): expected cash must be
  sealed by the server with the full ledger visible; sealing while offline
  writes are pending would freeze wrong numbers. The desk blocks the
  close while offline or while the outbox is non-empty for money surfaces.
- **Shift open**: same reasoning — the window defines every reconciliation
  that follows.
- **Void and rate-configuration changes**: organization-tier actions,
  performed on connected admin surfaces.

## 4. Conflicting offline-sync writes (concurrency by design)

Multi-cashier branches generate the named conflict cases; each has a
designed resolution, and the phase attack battery owns tests for each:

| Conflict | Resolution |
|---|---|
| Two desks check in to the same room while one is offline | The database's one-active-session-per-room guarantee (vault-16) rejects the loser at replay; the desk surfaces the rejection to the cashier as a failed check-in, not a silent drop |
| Two desks close the same shift | The close RPC rejects the second closer; shifts close once |
| The same entry replayed twice (network hiccup, crash after send) | Idempotency key coalesces; one row exists (vault-18) |
| Rate configuration changed remotely while a desk was offline | Replayed actions compute against current config; the cache refreshes on reconnect and the desk re-renders prices from the server copy |
| A voided session is referenced by a queued offline action | The procedure validates current status at replay and rejects with a surfaced error |

## 5. Reconnection and cache discipline

- Connectivity detection uses the browser's online/offline events
  confirmed by a lightweight reachability check — `navigator.onLine` alone
  lies on captive networks.
- On reconnect: drain the outbox (§2), then refresh the read caches
  (rooms, rate configuration, catalogue) before returning the desk to
  "live" status; the UI shows last-synced state while draining.
- Cache invalidation after any confirmed write follows the same query-key
  discipline as online writes — a confirmed check-in invalidates rooms and
  sessions together, because the server's write spans both
  (vault-10's invalidation pairing, restated as a rule).

## 6. Proof obligations specific to offline

- Playwright E2E covers the offline path with network throttling/offline
  mode and **video recording enabled** — the clips land in
  `/Silid/reports/proof/` as the phase's evidence
  (`spec/00-master-goal.md`, PROOF CLIPS).
- Required scenarios: queue-during-outage, ordered drain, duplicate-replay
  coalescence, poisoned-entry non-blocking, double-booking rejection at
  replay surfacing to the desk, shift-close blocked while offline,
  cache refresh on reconnect.
- The Money Recomputation Gate applies to any offline replay that
  produces pesos: replayed amounts must match an independent recomputation
  from the fixture and the ledger (`spec/domain-rules.md` §7).
