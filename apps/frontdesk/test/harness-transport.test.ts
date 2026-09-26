import { describe, expect, it, vi } from "vitest";
import { TransportFailure } from "@silid/offline-sync";
import { createHarnessTransport } from "../src/lib/harness/transport";
import { type HarnessAckBody, type HarnessWriteEnvelope } from "../src/lib/harness/double";

/**
 * Deliverable 6 — the desk's half of the harness write.
 *
 * The transport is where the contract's most consequential decision is made:
 * only a server that could not be *reached* produces a queueable failure.
 * Everything else is a final answer that must reach the cashier, so these
 * tests pin the classification rather than the plumbing.
 */

const ENVELOPE: HarnessWriteEnvelope = {
  idempotencyKey: "key-1",
  procedure: "harness_note",
  payload: { run: "run-a", seq: 1 },
  clientMetadata: { enqueuedAt: "2026-09-26T09:00:00.000Z" },
};

const ACK: HarnessAckBody = {
  idempotencyKey: "key-1",
  procedure: "harness_note",
  run: "run-a",
  seq: 1,
  receivedAt: "2026-09-26T12:00:00.000Z",
  clientEnqueuedAt: "2026-09-26T09:00:00.000Z",
  coalesced: false,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * A fetch stand-in that records how it was called. Typed as `typeof fetch` so
 * the recorded arguments are fetch's own, not a narrower fiction.
 */
function spyFetch(response: () => Response) {
  return vi.fn<typeof fetch>(async () => response());
}

describe("the harness transport", () => {
  it("returns the server's ack, whose sealed instant is the server's own", async () => {
    const fetchImpl = spyFetch(() => jsonResponse(200, ACK));
    const send = createHarnessTransport({ fetchImpl, endpoint: "/harness/write" });

    const ack = await send(ENVELOPE);

    expect(ack).toEqual(ACK);
    expect(ack.receivedAt).not.toBe(ack.clientEnqueuedAt);
  });

  it("sends exactly the envelope, and nothing beside it", async () => {
    // No client-supplied server timestamp and no extra envelope keys: the
    // strict schema on the other side is what proves this stayed true.
    const fetchImpl = spyFetch(() => jsonResponse(200, ACK));
    const send = createHarnessTransport({ fetchImpl, endpoint: "/harness/write" });

    await send(ENVELOPE);

    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "clientMetadata",
      "idempotencyKey",
      "payload",
      "procedure",
    ]);
    expect(init?.method).toBe("POST");
    // no-store so a queued replay never coalesces onto the HTTP cache's idea
    // of an earlier response.
    expect(init?.cache).toBe("no-store");
  });

  it.each([502, 503, 504])("treats a %i from a proxy as a transport failure", async (status) => {
    const fetchImpl = spyFetch(() => jsonResponse(status, { error: "no" }));
    const send = createHarnessTransport({ fetchImpl, endpoint: "/harness/write" });

    const attempt = send(ENVELOPE);

    await expect(attempt).rejects.toBeInstanceOf(TransportFailure);
    await expect(attempt).rejects.toThrow(String(status));
  });

  it("treats a thrown fetch as a transport failure, whatever the cause looks like", async () => {
    // A browser offline rejection is a TypeError, but a test double or an
    // exotic runtime can throw anything; the cause must stay readable either
    // way, because it is all the desk has to show a cashier.
    const fetchImpl = spyFetch(() => {
      throw "network down";
    });
    const send = createHarnessTransport({ fetchImpl, endpoint: "/harness/write" });

    const attempt = send(ENVELOPE);

    await expect(attempt).rejects.toBeInstanceOf(TransportFailure);
    await expect(attempt).rejects.toThrow(/network down/);
  });

  it("preserves the original cause on the transport failure", async () => {
    const cause = new Error("offline");
    const fetchImpl = spyFetch(() => {
      throw cause;
    });
    const send = createHarnessTransport({ fetchImpl, endpoint: "/harness/write" });

    await expect(send(ENVELOPE)).rejects.toMatchObject({ cause });
  });

  it.each([400, 409, 422])("surfaces a %i as a final rejection, never a queueable failure", async (status) => {
    const fetchImpl = spyFetch(() => jsonResponse(status, { error: "no", code: "harness_rejected" }));
    const send = createHarnessTransport({ fetchImpl, endpoint: "/harness/write" });

    const attempt = send(ENVELOPE);

    await expect(attempt).rejects.toThrowError(Error);
    // The distinction the drain depends on: a rejection must not be
    // reclassified as "try again later" and replayed on every reconnect.
    await expect(attempt).rejects.not.toBeInstanceOf(TransportFailure);
    await expect(attempt).rejects.toThrow(`${status}`);
  });

  it("posts to the configured harness endpoint", async () => {
    const fetchImpl = spyFetch(() => jsonResponse(200, ACK));
    const send = createHarnessTransport({ fetchImpl, endpoint: "/harness/write" });

    await send(ENVELOPE);

    expect(fetchImpl).toHaveBeenCalledWith("/harness/write", expect.anything());
  });
});
