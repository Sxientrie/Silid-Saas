import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createHarnessDouble,
  harnessWriteSchema,
  type HarnessWriteEnvelope,
} from "../src/lib/harness/double";

/**
 * Deliverable 6 — the harness-only mutation target.
 *
 * Phase 05 has no business features, so the write contract is proven against
 * a test double of one state-changing procedure (roadmap 05 Deliverable 6).
 * Three of its properties are the proof, not the plumbing:
 *
 *  1. the accept log is ordered, so "replayed in the order the actions were
 *     taken" is checkable server-side and not just on the desk;
 *  2. a repeat of an idempotency key coalesces onto the first accept instead
 *     of producing a second row;
 *  3. the accepted row's instant is the server's, and the desk's own instant
 *     survives only as explicitly-named client metadata.
 */

const AT = "2026-09-26T09:00:00.000Z";

function envelope(overrides: Partial<HarnessWriteEnvelope> = {}): HarnessWriteEnvelope {
  return {
    idempotencyKey: "key-1",
    procedure: "harness_note",
    payload: { run: "run-a", seq: 1 },
    clientMetadata: { enqueuedAt: AT },
    ...overrides,
  };
}

describe("the harness write envelope", () => {
  it("accepts exactly the four contract fields", () => {
    const parsed = harnessWriteSchema.safeParse(envelope());
    expect(parsed.success).toBe(true);
  });

  it("refuses an envelope carrying a server-looking timestamp field", () => {
    // The contract's Invariant 2a: the envelope has no field the server
    // could mistake for its own clock. A desk that grew one by accident is a
    // rejected write, not a silently stored authoritative instant.
    const parsed = harnessWriteSchema.safeParse({
      ...envelope(),
      receivedAt: AT,
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a write with no idempotency key, because replay could not coalesce", () => {
    expect(harnessWriteSchema.safeParse({ ...envelope(), idempotencyKey: "" }).success).toBe(false);
  });

  it("refuses a write with no client enqueue instant", () => {
    const parsed = harnessWriteSchema.safeParse({ ...envelope(), clientMetadata: {} });
    expect(parsed.success).toBe(false);
  });
});

describe("the harness double", () => {
  it("seals the accept instant with the server's own clock", () => {
    const double = createHarnessDouble({ now: () => "2026-09-26T12:00:00.000Z" });
    const outcome = double.accept(envelope());

    expect(outcome.kind).toBe("accepted");
    if (outcome.kind !== "accepted") throw new Error("unreachable");
    expect(outcome.body.receivedAt).toBe("2026-09-26T12:00:00.000Z");
    // The desk's instant is echoed back under a name that cannot be read as
    // authoritative, and the two are visibly different.
    expect(outcome.body.clientEnqueuedAt).toBe(AT);
    expect(outcome.body.receivedAt).not.toBe(outcome.body.clientEnqueuedAt);
  });

  it("coalesces a repeated idempotency key onto the first accept", () => {
    let tick = 0;
    // The clock advances between the two attempts: a second row would carry
    // the later instant, and that difference is the whole detection.
    const double = createHarnessDouble({
      now: () => new Date(Date.UTC(2026, 8, 26, 12, tick++ * 60)).toISOString(),
    });

    const first = double.accept(envelope());
    const second = double.accept(
      envelope({ payload: { run: "run-a", seq: 1 }, clientMetadata: { enqueuedAt: "2026-09-26T10:00:00.000Z" } }),
    );

    if (first.kind !== "accepted" || second.kind !== "accepted") throw new Error("unreachable");
    expect(first.body.coalesced).toBe(false);
    expect(second.body.coalesced).toBe(true);
    // The original sealed instant and the original client's instant, not the
    // replay's: the ledger kept the first observation of the action.
    expect(second.body.receivedAt).toBe(first.body.receivedAt);
    expect(second.body.clientEnqueuedAt).toBe(first.body.clientEnqueuedAt);
    expect(double.acceptLog()).toHaveLength(1);
  });

  it("treats a different key as a different action", () => {
    const double = createHarnessDouble();
    double.accept(envelope());
    double.accept(envelope({ idempotencyKey: "key-2", payload: { run: "run-a", seq: 2 } }));

    expect(double.acceptLog()).toHaveLength(2);
  });

  it("keeps the accept log in arrival order, for the ordered-drain proof", () => {
    const double = createHarnessDouble();
    for (const seq of [1, 2, 3]) {
      double.accept(envelope({ idempotencyKey: `key-${seq}`, payload: { run: "run-a", seq } }));
    }

    expect(double.acceptLog().map((row) => row.seq)).toEqual([1, 2, 3]);
  });

  it("rejects an injected rejection and keeps it out of the accept log", () => {
    // A rejection is a server that was reachable and said no. It never
    // reaches the ledger, and the desk surfaces it rather than replaying it.
    const double = createHarnessDouble();
    const outcome = double.accept(
      envelope({ payload: { run: "run-a", seq: 1, inject: "reject" } }),
    );

    expect(outcome).toMatchObject({ kind: "rejected", status: 409 });
    expect(double.acceptLog()).toHaveLength(0);
  });

  it("reports an injected outage as a transport failure, not a rejection", () => {
    // 5xx is the shape a branch proxy takes when it cannot reach the app; the
    // desk must treat it as "try again later", the opposite of a rejection.
    const double = createHarnessDouble();
    const outcome = double.accept(
      envelope({ payload: { run: "run-a", seq: 1, inject: "unavailable" } }),
    );

    expect(outcome).toMatchObject({ kind: "unavailable", status: 503 });
    expect(double.acceptLog()).toHaveLength(0);
  });

  it("rejects an envelope it cannot read as a bad request, never as an outage", () => {
    const double = createHarnessDouble();
    const outcome = double.accept({
      idempotencyKey: "key-1",
      procedure: "harness_note",
      payload: { run: "run-a", seq: "not-a-number" },
      clientMetadata: { enqueuedAt: AT },
    });

    expect(outcome).toMatchObject({ kind: "rejected", status: 400 });
  });

  it("scopes the visible log to one desk's run, so parallel desks do not read each other's", () => {
    const double = createHarnessDouble();
    double.accept(envelope({ idempotencyKey: "a", payload: { run: "run-a", seq: 1 } }));
    double.accept(envelope({ idempotencyKey: "b", payload: { run: "run-b", seq: 1 } }));

    expect(double.acceptLog("run-a").map((row) => row.seq)).toEqual([1]);
    expect(double.acceptLog()).toHaveLength(2);
  });
});

describe("the double's schema and its types agreeing", () => {
  it("exports the same shape the parser enforces", () => {
    // A cheap guard against the schema and the exported types drifting: the
    // double is a test target, and a test target that stops parsing what the
    // desk sends fails silently.
    const parsed = harnessWriteSchema.parse(envelope());
    expect(Object.keys(parsed).sort()).toEqual([
      "clientMetadata",
      "idempotencyKey",
      "payload",
      "procedure",
    ]);
    expect(z.string().safeParse(parsed.procedure).success).toBe(true);
  });
});
