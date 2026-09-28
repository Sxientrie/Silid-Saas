import {
  TransportFailure,
  submitWrite,
  type SilidOfflineDb,
} from "@silid/offline-sync";
import type { SessionView } from "@silid/schemas";
import { classifySendFailure, type DeskTrpcClient } from "@/lib/trpc/client";

/**
 * The sessions feature's remote service (spec/monorepo-structure.md §3:
 * remote via tRPC) riding the offline write contract (spec/offline-sync.md
 * §2). Both desk actions are money-affecting, so both label themselves to the
 * online-only gate, and both ride the same rules: online first, durable
 * outbox entry on transport failure, idempotent ordered replay, and the
 * server's figures win at replay (spec/offline-sync.md §2.5).
 *
 * Check-out is deliberately NOT online-only (§3 names shift open/close, voids,
 * and rate configuration): a queued checkout replays against the full ledger
 * and seals with the server's own clock, which is exactly the vault-11
 * transaction — and the shift-close gate stays blocked while the entry is
 * pending, so no expected-cash figure can freeze around it.
 */

/** The check-in payload is the client preference triple and nothing else. */
export interface CheckInPayload {
  roomId: string;
  bookingType: "short_time" | "overnight";
  pax: number;
}

export interface CheckOutPayload {
  sessionId: string;
}

export const SESSION_CHECK_IN_PROCEDURE = "sessions.createSession" as const;
export const SESSION_CHECK_OUT_PROCEDURE = "sessions.closeSession" as const;

/**
 * The drain's dispatcher: one replayable procedure name → its tRPC mutation.
 * Every failure is classified here, so the outbox only ever sees the two
 * failure classes the contract knows (transport vs refusal).
 */
export function createDeskWriteSender(
  client: DeskTrpcClient,
): (write: { idempotencyKey: string; procedure: string; payload: unknown }) => Promise<unknown> {
  return async (write) => {
    try {
      switch (write.procedure) {
        case SESSION_CHECK_IN_PROCEDURE:
          return await client.sessions.createSession.mutate(write.payload as CheckInPayload);
        case SESSION_CHECK_OUT_PROCEDURE:
          return await client.sessions.closeSession.mutate(write.payload as CheckOutPayload);
        default:
          // A procedure this desk does not know is a bug in the queue, not an
          // outage: surface it instead of replaying it forever.
          throw new Error(`unknown procedure: ${write.procedure}`);
      }
    } catch (error) {
      throw classifySendFailure(error);
    }
  };
}

export interface SubmitCheckInResult {
  status: "confirmed" | "queued";
  session?: SessionView;
}

/** The write envelope the contract hands the send function (OutboundWrite's shape). */
export type DeskSend = (write: {
  idempotencyKey: string;
  procedure: string;
  payload: unknown;
  clientMetadata: { enqueuedAt: string };
}) => Promise<unknown>;

export interface SubmitCheckInOptions {
  db: SilidOfflineDb;
  send: DeskSend;
  /** The desk's reachability verdict; a known-offline desk skips the attempt. */
  isOnline?: () => boolean;
  now?: () => Date;
}

export async function submitCheckIn(
  input: CheckInPayload,
  options: SubmitCheckInOptions,
): Promise<SubmitCheckInResult> {
  const outcome = await submitWrite<SessionView>(options.db, {
    procedure: SESSION_CHECK_IN_PROCEDURE,
    payload: input,
    moneyAffecting: true,
    // The dispatcher's confirmed row IS the createSession mutation's output
    // (the procedure's own type carries it); the wide `unknown` is the
    // drain-facing shape, so the narrowing is asserted at this boundary.
    send: options.send as (write: Parameters<DeskSend>[0]) => Promise<SessionView>,
    isOnline: options.isOnline,
    now: options.now,
  });
  return outcome.status === "confirmed"
    ? { status: "confirmed", session: outcome.row }
    : { status: "queued" };
}

export interface SubmitCheckOutResult {
  status: "confirmed" | "queued";
  total?: string;
  session?: SessionView;
}

export type SubmitCheckOutOptions = SubmitCheckInOptions;

export async function submitCheckOut(
  input: CheckOutPayload,
  options: SubmitCheckOutOptions,
): Promise<SubmitCheckOutResult> {
  const outcome = await submitWrite<{ total: string; session: SessionView }>(options.db, {
    procedure: SESSION_CHECK_OUT_PROCEDURE,
    payload: input,
    moneyAffecting: true,
    send: options.send as (write: Parameters<DeskSend>[0]) => Promise<{ total: string; session: SessionView }>,
    isOnline: options.isOnline,
    now: options.now,
  });
  return outcome.status === "confirmed"
    ? { status: "confirmed", total: outcome.row.total, session: outcome.row.session }
    : { status: "queued" };
}

export { TransportFailure };
