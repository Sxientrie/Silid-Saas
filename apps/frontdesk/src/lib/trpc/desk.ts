"use client";

import { createConnectivityMonitor, createReachabilityProbe, CROSS_DESK_POLL_INTERVAL_MS } from "@silid/offline-sync";
import { useEffect, useState } from "react";
import { createDeskTrpcClient, type DeskTrpcClient } from "@/lib/trpc/client";

/**
 * The desk's single tRPC client and connectivity monitor. One browser-side
 * instance per origin: the reachability probe is the authority on the link
 * (`navigator.onLine` alone lies on captive networks, spec/offline-sync.md
 * §5), and the 15-second design interval is the v1 cross-desk freshness
 * mechanism for the transactional views.
 */

export const DESK_TRPC_URL = "/api/trpc";
export const DESK_PROBE_URL = "/api/health";

let cachedClient: DeskTrpcClient | null = null;

export function deskTrpc(): DeskTrpcClient {
  if (cachedClient === null) {
    cachedClient = createDeskTrpcClient({ url: DESK_TRPC_URL });
  }
  return cachedClient;
}

export interface DeskConnectivity {
  online: boolean;
  /** Re-probe now (the desk's own reachability verdict, not a guess). */
  checkNow: () => Promise<boolean>;
}

export function useDeskConnectivity(): DeskConnectivity {
  const [online, setOnline] = useState(false);
  const [monitor] = useState(() =>
    createConnectivityMonitor({
      probe: createReachabilityProbe(DESK_PROBE_URL),
      onChange: setOnline,
    }),
  );

  useEffect(() => {
    monitor.start();
    void monitor.checkNow();
    return () => monitor.stop();
  }, [monitor]);

  return { online, checkNow: () => monitor.checkNow() };
}

/** The cross-desk poll interval for the transactional views (§5). */
export const CROSS_DESK_POLL = CROSS_DESK_POLL_INTERVAL_MS;
