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

/**
 * The probe is re-run on an interval, not only on browser events: the events
 * are hints (§5), and a link that dies silently — a captive portal, an
 * emulated outage, a hung uplink — never fires them. A stale "online"
 * verdict is exactly the lie this monitor exists to prevent.
 */
const PROBE_INTERVAL_MS = 5_000;

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
    const timer = window.setInterval(() => void monitor.checkNow(), PROBE_INTERVAL_MS);
    return () => {
      monitor.stop();
      window.clearInterval(timer);
    };
  }, [monitor]);

  return { online, checkNow: () => monitor.checkNow() };
}

/** The cross-desk poll interval for the transactional views (§5). */
export const CROSS_DESK_POLL = CROSS_DESK_POLL_INTERVAL_MS;
