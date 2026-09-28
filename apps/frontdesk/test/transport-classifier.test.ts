import { describe, expect, it } from "vitest";
import { TransportFailure } from "@silid/offline-sync";
import { classifySendFailure, createDeskTrpcClient } from "@/lib/trpc/client";
import { createDeskWriteSender } from "@/features/sessions/sessions.remote";

/**
 * The desk transport's one decision (spec/offline-sync.md §2.1–§2.4): only a
 * server that could not be REACHED makes a write queueable. A reachable
 * server that refused has said no — surfaced, poisoned in the outbox, never
 * replayed forever. The harness transport asserts the same decision at its
 * own boundary; this file asserts it where tRPC reshapes the errors.
 */

function trpcErrorShape(message: string, httpStatus: number | undefined, code?: string): unknown {
  return Object.assign(new Error(message), {
    data: { code: code ?? "INTERNAL_SERVER_ERROR", httpStatus },
  });
}

describe("classifySendFailure — queueable vs final", () => {
  it("classifies a bare TransportFailure as transport", () => {
    const failure = new TransportFailure("offline");
    expect(classifySendFailure(failure)).toBe(failure);
  });

  it("unwraps a TransportFailure the custom fetch threw into a tRPC cause chain", () => {
    const failure = new TransportFailure("gateway status 503");
    const wrapped = Object.assign(new Error("Request failed"), { cause: failure });
    expect(classifySendFailure(wrapped)).toBe(failure);
  });

  it("classifies a gateway status (502/503/504) as transport", () => {
    for (const status of [502, 503, 504]) {
      const classified = classifySendFailure(trpcErrorShape("bad gateway", status));
      expect(classified).toBeInstanceOf(TransportFailure);
    }
  });

  it("classifies a server refusal with an HTTP status as final", () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      const classified = classifySendFailure(trpcErrorShape("refused", status));
      expect(classified).not.toBeInstanceOf(TransportFailure);
    }
  });

  it("classifies a fetch that never completed as transport", () => {
    const offline = Object.assign(new TypeError("Failed to fetch"));
    expect(classifySendFailure(offline)).toBeInstanceOf(TransportFailure);
    const nodeFetchFailed = Object.assign(new Error("fetch failed"), { cause: new TypeError("fetch failed") });
    expect(classifySendFailure(nodeFetchFailed)).toBeInstanceOf(TransportFailure);
  });

  it("treats a non-tRPC error page (reached, unknown shape) as final so a human sees it", () => {
    const classified = classifySendFailure(new Error("<html>500</html>"));
    expect(classified).not.toBeInstanceOf(TransportFailure);
  });
});

describe("createDeskWriteSender — the drain's dispatcher", () => {
  const client = createDeskTrpcClient({ fetchImpl: (async () => new Response(null)) as typeof fetch });

  it("refuses a procedure this desk does not know, as a final error", async () => {
    const sender = createDeskWriteSender(client);
    await expect(sender({ idempotencyKey: "k", procedure: "time_travel.goBack", payload: {} })).rejects.toThrow(
      /unknown procedure/,
    );
  });

  it("classifies the dispatch's failures before they reach the outbox", async () => {
    const failingClient = {
      sessions: {
        createSession: {
          mutate: async () => {
            throw trpcErrorShape("room must be vacant", 400, "BAD_REQUEST");
          },
        },
      },
    };
    const sender = createDeskWriteSender(failingClient as never);
    // The reachable server's refusal stays a plain error (poisoned), not a
    // TransportFailure (queued).
    await expect(
      sender({ idempotencyKey: "k", procedure: "sessions.createSession", payload: {} }),
    ).rejects.not.toBeInstanceOf(TransportFailure);
  });
});
