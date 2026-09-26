import type { SilidOfflineDb } from "./db";
import { listReplayable } from "./outbox";

/**
 * What is online-only by design (spec/offline-sync.md §3). These four actions
 * are not "nice to have online" — running them from a desk that cannot see
 * the server's ledger would seal the wrong numbers.
 */
export const ONLINE_ONLY_ACTIONS = [
  "shift_open",
  "shift_close",
  "void_session",
  "update_rate_config",
] as const;

export type OnlineOnlyAction = (typeof ONLINE_ONLY_ACTIONS)[number];

const ONLINE_ONLY_SET: ReadonlySet<string> = new Set<string>(ONLINE_ONLY_ACTIONS);

/**
 * The two whose correctness depends on the ledger being *complete*, not merely
 * reachable: sealing expected cash with money writes still queued would freeze
 * a number that is about to change (spec/offline-sync.md §3).
 */
const LEDGER_COMPLETE_ACTIONS: ReadonlySet<string> = new Set<string>(["shift_open", "shift_close"]);

export interface OnlineOnlyContext {
  online: boolean;
  pendingMoneyEntries: number;
}

export type OnlineOnlyVerdict =
  | { allowed: true }
  | { allowed: false; code: "offline" | "pending_money"; reason: string };

export function evaluateOnlineOnly(action: string, context: OnlineOnlyContext): OnlineOnlyVerdict {
  if (!ONLINE_ONLY_SET.has(action)) return { allowed: true };

  if (!context.online) {
    return {
      allowed: false,
      code: "offline",
      reason: `${action} is sealed by the server with the full ledger visible, so it cannot run from an offline desk.`,
    };
  }

  if (LEDGER_COMPLETE_ACTIONS.has(action) && context.pendingMoneyEntries > 0) {
    return {
      allowed: false,
      code: "pending_money",
      reason: `${context.pendingMoneyEntries} money-affecting write(s) are still queued; ${action} would seal figures that are about to change.`,
    };
  }

  return { allowed: true };
}

/**
 * How many money-affecting writes the gate is holding a shift for. Errored
 * rows are excluded: they will never be replayed, so they are a stuck entry
 * for a human to resolve, not a pending change to the ledger. Counting them
 * would block the close forever with nothing left to drain.
 */
export async function countPendingMoneyEntries(db: SilidOfflineDb): Promise<number> {
  const replayable = await listReplayable(db);
  return replayable.filter((entry) => entry.moneyAffecting).length;
}
