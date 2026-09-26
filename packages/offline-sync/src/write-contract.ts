import type { OutboxEntry, SilidOfflineDb } from "./db";
import { enqueue, newIdempotencyKey, TransportFailure, type OutboundWrite } from "./outbox";

/**
 * The online-first write wrapper (spec/offline-sync.md §2.1-§2.2): attempt the
 * server, fall back to a durable queue entry only when the server could not
 * be reached, and never swallow a rejection.
 */
export interface SubmitWriteOptions<TResult> {
  procedure: string;
  payload: unknown;
  send: (write: OutboundWrite) => Promise<TResult>;
  /**
   * The desk's reachability verdict. When it already says offline the network
   * is not touched at all — queueing a write the desk knows cannot land is
   * cheaper than waiting for a timeout the cashier would watch tick.
   */
  isOnline?: () => boolean;
  now?: () => Date;
  moneyAffecting?: boolean;
  idempotencyKey?: string;
}

export type SubmitWriteOutcome<TResult> =
  | { status: "confirmed"; row: TResult }
  | { status: "queued"; entry: OutboxEntry };

export async function submitWrite<TResult>(
  db: SilidOfflineDb,
  options: SubmitWriteOptions<TResult>,
): Promise<SubmitWriteOutcome<TResult>> {
  // The key and the enqueue instant are minted before the attempt, so a send
  // that dies after reaching the server queues under the *same* key the server
  // may already have used. That is the whole crash-after-send story.
  const idempotencyKey = options.idempotencyKey ?? newIdempotencyKey();
  const enqueuedAt = (options.now ?? ((): Date => new Date()))().toISOString();
  const write: OutboundWrite = {
    idempotencyKey,
    procedure: options.procedure,
    payload: options.payload,
    clientMetadata: { enqueuedAt },
  };

  if (options.isOnline?.() ?? true) {
    try {
      return { status: "confirmed", row: await options.send(write) };
    } catch (error) {
      // A reachable server that refuses the action has said no. Queueing it
      // would replay a doomed write on every reconnect and hide the reason
      // from the cashier, so the rejection propagates untouched.
      if (!(error instanceof TransportFailure)) throw error;
    }
  }

  const entry = await enqueue(db, {
    procedure: options.procedure,
    payload: options.payload,
    idempotencyKey,
    moneyAffecting: options.moneyAffecting,
    now: (): Date => new Date(enqueuedAt),
  });
  return { status: "queued", entry };
}
