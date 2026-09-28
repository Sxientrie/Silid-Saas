import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@silid/api";
import { TransportFailure } from "@silid/offline-sync";

/**
 * The desk's tRPC client and the send-failure classifier that feeds the
 * offline write contract (spec/offline-sync.md §2): a write is queueable only
 * when the server could not be REACHED. A reachable server that refused the
 * action has said no — queueing it would replay a doomed write on every
 * reconnect and hide the reason from the cashier, so refusals propagate as
 * ordinary errors and land in the outbox as poisoned entries (surfaced, never
 * silently retried).
 *
 * The classification decision is the same one the harness transport makes
 * (lib/harness/transport.ts), applied at the boundary where a tRPC error
 * either carries the server's own status (reached) or carries nothing at all
 * (the fetch never completed).
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

/** The signature of a fetch that never got on the wire (offline, DNS, reset). */
function isFetchNetworkError(error: unknown): boolean {
  const failure = error as { cause?: unknown; message?: string } | undefined;
  if (failure?.cause instanceof TypeError) return true;
  return /failed to fetch|fetch failed|networkerror|load failed/i.test(String(failure?.message ?? ""));
}

function httpStatusOf(error: unknown): number | undefined {
  const status = (error as { data?: { httpStatus?: number } } | undefined)?.data?.httpStatus;
  return typeof status === "number" ? status : undefined;
}

/**
 * Reduce whatever a tRPC mutation threw into the write contract's two
 * failure classes: a TransportFailure (queue it) or a plain Error (surface
 * it). Idempotent — a TransportFailure passes through untouched.
 */
export function classifySendFailure(error: unknown): Error {
  if (error instanceof TransportFailure) {
    return error;
  }
  // The custom fetch below throws TransportFailure on a gateway status;
  // tRPC wraps it as the cause.
  const wrapped = (error as { cause?: unknown } | undefined)?.cause;
  if (wrapped instanceof TransportFailure) {
    return wrapped;
  }
  const status = httpStatusOf(error);
  if (status !== undefined) {
    // The server (or a proxy speaking for it) answered. Only the gateway
    // statuses mean "never reached the app".
    if (TRANSPORT_STATUSES.has(status)) {
      return new TransportFailure(`desk write hit gateway status ${status}`, { cause: error });
    }
    return error instanceof Error ? error : new Error(describeCause(error));
  }
  if (isFetchNetworkError(error)) {
    return new TransportFailure(`desk write could not reach the server: ${describeCause(error)}`, {
      cause: error,
    });
  }
  // Reached something that answered neither a tRPC error shape nor a network
  // signature (e.g. an HTML error page from a crashed app). That is a
  // deterministic failure a human must see — surfaced, not replayed forever.
  return error instanceof Error ? error : new Error(describeCause(error));
}

/**
 * Fetch wrapper for the batch link: a gateway status becomes a
 * TransportFailure here (before tRPC reshapes it), everything else flows
 * through untouched.
 */
function transportAwareFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    let response: Response;
    try {
      response = await fetchImpl(input, init);
    } catch (cause) {
      throw new TransportFailure(`desk write could not reach the server: ${describeCause(cause)}`, {
        cause,
      });
    }
    if (TRANSPORT_STATUSES.has(response.status)) {
      throw new TransportFailure(`desk write hit gateway status ${response.status}`);
    }
    return response;
  };
}

export interface DeskTrpcOptions {
  /** Injectable so the classification is assertable without a network. */
  fetchImpl?: typeof fetch;
  /** Defaults to the app's own tRPC endpoint. */
  url?: string;
}

export function createDeskTrpcClient(options: DeskTrpcOptions = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: options.url ?? "/api/trpc",
        fetch: transportAwareFetch(fetchImpl),
      }),
    ],
  });
}

export type DeskTrpcClient = ReturnType<typeof createDeskTrpcClient>;
