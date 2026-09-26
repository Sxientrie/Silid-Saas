import { z } from "zod";

/**
 * HARNESS-ONLY. The mutation target the offline write contract is proven
 * against (roadmap 05 Deliverable 6).
 *
 * Phase 05 ships no business features, so there is no real state-changing
 * procedure to queue. This module is a stand-in for one: a single named
 * action, `harness_note`, that records that it happened. It is explicitly a
 * test double and carries no money, no rates, and no rooms — nothing here can
 * reach guest billing or platform billing, which is why it can never trip the
 * Money Recomputation Gate.
 *
 * What it does prove is the contract, not the feature: replay order,
 * idempotency-key coalescence, and the server re-sealing time.
 */

/** `run` scopes one E2E test's actions so parallel desks never read each
 *  other's log; `seq` is the desk's own action counter and is what the
 *  ordered-drain assertion reads back. */
export const harnessWriteSchema = z.strictObject({
  idempotencyKey: z.string().min(1),
  procedure: z.string().min(1),
  payload: z.strictObject({
    run: z.string().min(1),
    seq: z.number().int().positive(),
    note: z.string().optional(),
    /**
     * Test-only fault switches. `reject` is a reachable server saying no
     * (409); `unavailable` is a proxy that could not reach the app (503).
     * The two are the branches the desk's drain classifies differently.
     */
    inject: z.enum(["reject", "unavailable"]).optional(),
  }),
  // The desk's instant, and nothing else. There is deliberately no field the
  // server could mistake for its own clock (Invariant 2a), and the strict
  // object is what turns an accidental extra one into a rejection.
  clientMetadata: z.strictObject({ enqueuedAt: z.string().min(1) }),
});

export type HarnessWriteEnvelope = z.output<typeof harnessWriteSchema>;

/** One accepted action, exactly as the server holds it. */
export interface HarnessAcceptRow {
  idempotencyKey: string;
  procedure: string;
  run: string;
  seq: number;
  note?: string;
  /** Sealed by the server's clock, never the desk's. */
  receivedAt: string;
  /** Echoed back under a name that cannot read as authoritative. */
  clientEnqueuedAt: string;
}

export interface HarnessAckBody extends HarnessAcceptRow {
  /** True when this key was already accepted and the send was coalesced. */
  coalesced: boolean;
}

export type HarnessOutcome =
  | { kind: "accepted"; status: 200; body: HarnessAckBody; coalesced: boolean }
  | { kind: "rejected"; status: 400 | 409; body: { error: string; code: string } }
  | { kind: "unavailable"; status: 503; body: { error: string; code: string } };

export interface HarnessDoubleOptions {
  /** The server's clock. Injected so the sealed instant is assertable. */
  now?: () => string;
}

export interface HarnessDouble {
  accept(input: unknown): HarnessOutcome;
  acceptLog(run?: string): HarnessAcceptRow[];
  clear(): void;
}

export function createHarnessDouble(options: HarnessDoubleOptions = {}): HarnessDouble {
  const now = options.now ?? ((): string => new Date().toISOString());
  // Server-memory ledger, deliberately: a test double that persisted would
  // need a migration story for state no product reads.
  const accepted: HarnessAcceptRow[] = [];
  const byKey = new Map<string, HarnessAcceptRow>();

  return {
    accept(input: unknown): HarnessOutcome {
      const parsed = harnessWriteSchema.safeParse(input);
      if (!parsed.success) {
        // A write the server cannot read is a bad request, not an outage: the
        // desk must surface it rather than replay it forever.
        return {
          kind: "rejected",
          status: 400,
          body: { error: "Unreadable harness write envelope.", code: "harness_bad_envelope" },
        };
      }
      const { idempotencyKey, procedure, payload, clientMetadata } = parsed.data;

      const seen = byKey.get(idempotencyKey);
      if (seen) {
        // Coalesce onto the first observation: one action, one row, and the
        // original instants survive rather than the replay's.
        return {
          kind: "accepted",
          status: 200,
          body: { ...seen, coalesced: true },
          coalesced: true,
        };
      }

      if (payload.inject === "unavailable") {
        return {
          kind: "unavailable",
          status: 503,
          body: { error: "Injected outage.", code: "harness_unavailable" },
        };
      }
      if (payload.inject === "reject") {
        return {
          kind: "rejected",
          status: 409,
          body: { error: "Injected rejection.", code: "harness_rejected" },
        };
      }

      const row: HarnessAcceptRow = {
        idempotencyKey,
        procedure,
        run: payload.run,
        seq: payload.seq,
        ...(payload.note === undefined ? {} : { note: payload.note }),
        receivedAt: now(),
        clientEnqueuedAt: clientMetadata.enqueuedAt,
      };
      accepted.push(row);
      byKey.set(idempotencyKey, row);

      return {
        kind: "accepted",
        status: 200,
        body: { ...row, coalesced: false },
        coalesced: false,
      };
    },

    acceptLog(run?: string): HarnessAcceptRow[] {
      return run === undefined ? [...accepted] : accepted.filter((row) => row.run === run);
    },

    clear(): void {
      accepted.length = 0;
      byKey.clear();
    },
  };
}
