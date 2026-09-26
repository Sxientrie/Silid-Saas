import { TransportFailure, type OutboundWrite } from "@silid/offline-sync";
import { type HarnessAckBody } from "./double";

/**
 * HARNESS-ONLY. The desk-side transport for the harness write
 * (roadmap 05 Deliverable 6).
 *
 * It exists to make one decision checkable: a write is queueable only when the
 * server could not be reached. A fetch that threw, or a gateway status from a
 * proxy that never got there, is a `TransportFailure`. A server that was
 * reached and answered 4xx has given a final answer, and the write is
 * rejected — replaying it would just re-send a doomed action on every
 * reconnect while hiding the reason.
 */

/**
 * Gateway statuses are the shape a branch proxy takes when it cannot reach
 * the app, so they join the thrown-fetch branch. 501 and 505 are left out on
 * purpose: neither is ever a transient "not right now".
 */
const TRANSPORT_STATUSES = new Set([502, 503, 504]);

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export interface HarnessTransportOptions {
  /** Injectable so the classification is assertable without a network. */
  fetchImpl?: typeof globalThis.fetch;
  /** Defaults to the harness-only mutation route. */
  endpoint?: string;
}

export const HARNESS_WRITE_ENDPOINT = "/harness/write";

export type HarnessSender = (write: OutboundWrite) => Promise<HarnessAckBody>;

export function createHarnessTransport(options: HarnessTransportOptions = {}): HarnessSender {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const endpoint = options.endpoint ?? HARNESS_WRITE_ENDPOINT;

  return async function send(write: OutboundWrite): Promise<HarnessAckBody> {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(write),
        // A replay must reach the server, never the HTTP cache's memory of an
        // earlier attempt at the same URL.
        cache: "no-store",
      });
    } catch (cause) {
      throw new TransportFailure(
        `Harness write could not reach the server: ${describeCause(cause)}`,
        { cause },
      );
    }

    const text = await response.text();

    if (!response.ok && TRANSPORT_STATUSES.has(response.status)) {
      throw new TransportFailure(
        `Harness write hit a gateway status ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    if (!response.ok) {
      throw new Error(`Harness write refused with ${response.status}: ${text.slice(0, 200)}`);
    }

    return JSON.parse(text) as HarnessAckBody;
  };
}
