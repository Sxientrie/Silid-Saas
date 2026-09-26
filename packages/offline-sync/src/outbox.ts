import type { OutboxEntry, SilidOfflineDb } from "./db";

/**
 * The outbox write contract (spec/offline-sync.md §2): ordered, idempotent
 * replay with poisoned-entry non-blocking and server-sealed time.
 */

/**
 * Thrown when the server could not be reached — DNS failure, reset
 * connection, offline, 5xx from a proxy. This is the *only* class of failure
 * that makes a write queueable: a rejection from a reachable server is final,
 * and replaying a doomed action forever is worse than surfacing it.
 */
export class TransportFailure extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransportFailure";
  }
}

/**
 * The envelope handed to the transport. Its shape is the whole point:
 * `clientMetadata` names the client's instant so nothing in it can be read as
 * a server-owned timestamp, and there is no field for one (Invariant 2a).
 */
export interface OutboundWrite {
  idempotencyKey: string;
  procedure: string;
  payload: unknown;
  clientMetadata: { enqueuedAt: string };
}

export interface DrainResult {
  /** Entries the server accepted this pass. */
  drained: number;
  /** Entries the server rejected; marked errored and left visible. */
  poisoned: number;
  /** Rows still in the outbox afterwards, errored ones included. */
  remaining: number;
  /** The server became unreachable, so the rest were left for later. */
  stoppedByTransport: boolean;
}

export interface EnqueueOptions {
  procedure: string;
  payload: unknown;
  /** Supplied by a replaying caller so the retry keeps the same key. */
  idempotencyKey?: string;
  now?: () => Date;
  /**
   * Defaults to false: a write is treated as money-affecting only when the
   * call site says so, and the surfaces that block a shift close read this
   * flag. Callers that create sessions label their writes explicitly.
   */
  moneyAffecting?: boolean;
}

/**
 * A version-4 UUID from the platform CSPRNG, built here rather than through
 * `crypto.randomUUID()` because that is gated on a secure context, and a desk
 * machine on a plain-HTTP branch LAN is exactly the machine that must still
 * be able to queue.
 */
export function newIdempotencyKey(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export async function enqueue(
  db: SilidOfflineDb,
  options: EnqueueOptions,
): Promise<OutboxEntry> {
  const now = options.now ?? ((): Date => new Date());
  const entry: OutboxEntry = {
    idempotencyKey: options.idempotencyKey ?? newIdempotencyKey(),
    procedure: options.procedure,
    payload: options.payload,
    enqueuedAt: now().toISOString(),
    moneyAffecting: options.moneyAffecting ?? false,
    state: "pending",
    attempts: 0,
  };
  const id = await db.outbox.add(entry);
  return { ...entry, id };
}

/**
 * Every row the drain may attempt, oldest first. `inflight` rows are
 * included on purpose: a row left in flight is one whose send never
 * completed, so the server may or may not hold it — the idempotency key is
 * what settles that, which is why a crash mid-send is safe to replay.
 * `errored` rows are excluded forever: they were rejected by a server that
 * was reachable, and the desk surfaces them for a human instead.
 */
export async function listReplayable(db: SilidOfflineDb): Promise<OutboxEntry[]> {
  const rows = await db.outbox.orderBy("id").toArray();
  return rows.filter((entry) => entry.state !== "errored");
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Drain the outbox oldest-first. A rejected entry is marked errored and the
 * drain continues; an unreachable server stops the pass, because the next
 * entry would fail the same way and each attempt would burn the desk's
 * connectivity for nothing.
 */
export async function drain(
  db: SilidOfflineDb,
  send: (write: OutboundWrite) => Promise<unknown>,
): Promise<DrainResult> {
  const replayable = await listReplayable(db);
  let drained = 0;
  let poisoned = 0;
  let stoppedByTransport = false;

  for (const entry of replayable) {
    await db.outbox.update(entry.id!, {
      state: "inflight",
      attempts: entry.attempts + 1,
    });
    try {
      await send({
        idempotencyKey: entry.idempotencyKey,
        procedure: entry.procedure,
        payload: entry.payload,
        clientMetadata: { enqueuedAt: entry.enqueuedAt },
      });
    } catch (error) {
      if (error instanceof TransportFailure) {
        // Back to pending, attempts kept, so the next pass retries it and the
        // desk can see how often it has failed.
        await db.outbox.update(entry.id!, { state: "pending" });
        stoppedByTransport = true;
        break;
      }
      await db.outbox.update(entry.id!, { state: "errored", lastError: describeError(error) });
      poisoned += 1;
      continue;
    }
    await db.outbox.delete(entry.id!);
    drained += 1;
  }

  return { drained, poisoned, remaining: await db.outbox.count(), stoppedByTransport };
}
