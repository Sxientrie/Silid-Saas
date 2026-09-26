import type { DrainResult } from "./outbox";

/**
 * The reconnection path (spec/offline-sync.md §5). The order is the whole
 * contract: drain first, refresh the read caches second. Refreshing first
 * would overwrite the desk's cache with pre-drain data and leave the
 * just-accepted writes invisible until the next sync.
 */

/**
 * The v1 cross-desk freshness mechanism: claim-scoped polling of the
 * transactional views (sessions, rooms, shift summary) at this design
 * interval. Push (Supabase Realtime) is a future optimization, not a v1
 * dependency.
 */
export const CROSS_DESK_POLL_INTERVAL_MS = 15_000;

export interface ReconnectSteps {
  drainOutbox: () => Promise<DrainResult>;
  refreshCaches: () => Promise<void>;
  now?: () => Date;
}

export interface ReconnectResult {
  /** False while anything is still queued or the drain lost the connection. */
  live: boolean;
  drained: number;
  poisoned: number;
  remaining: number;
  /** Present only once both steps finished; the desk's last-synced surface. */
  lastSyncedAt?: string;
}

export async function runReconnect(steps: ReconnectSteps): Promise<ReconnectResult> {
  const drained = await steps.drainOutbox();

  if (drained.stoppedByTransport) {
    // The caches keep their last-synced contents. A desk that cannot reach
    // the server must not replace what it shows with a failed refresh.
    return {
      live: false,
      drained: drained.drained,
      poisoned: drained.poisoned,
      remaining: drained.remaining,
    };
  }

  await steps.refreshCaches();
  const now = steps.now ?? ((): Date => new Date());
  return {
    live: drained.remaining === 0,
    drained: drained.drained,
    poisoned: drained.poisoned,
    remaining: drained.remaining,
    lastSyncedAt: now().toISOString(),
  };
}
