/**
 * Reconnection and connectivity detection (spec/offline-sync.md §5).
 *
 * `navigator.onLine` reports whether the machine has *a* network interface,
 * which is not the same question as "can the desk reach the server": a
 * captive portal or a dead uplink both report online. So the browser's
 * events are treated as hints and a lightweight HEAD probe is the authority.
 */

export type ReachabilityProbe = () => Promise<boolean>;

export interface ConnectivityMonitorOptions {
  probe: ReachabilityProbe;
  onChange: (online: boolean) => void;
  /** Defaults to the global object; tests pass their own EventTarget. */
  target?: EventTarget;
}

export interface ConnectivityMonitor {
  start(): void;
  stop(): void;
  /** Runs the probe now and resolves its verdict. */
  checkNow(): Promise<boolean>;
  isOnline(): boolean;
}

export interface ReachabilityProbeOptions {
  fetchImpl?: typeof fetch;
}

export function createReachabilityProbe(
  url: string,
  options: ReachabilityProbeOptions = {},
): ReachabilityProbe {
  const request = options.fetchImpl ?? globalThis.fetch;
  return async (): Promise<boolean> => {
    try {
      // HEAD, not GET: the answer is the status line, and a health probe
      // must not pull a body on every connectivity change.
      const response = await request(url, { method: "HEAD", cache: "no-store" });
      return response.ok;
    } catch {
      // A throwing fetch is a verdict, not an exception the caller should
      // have to handle: unreachable and "not yet" look the same to a desk.
      return false;
    }
  };
}

export function createConnectivityMonitor(
  options: ConnectivityMonitorOptions,
): ConnectivityMonitor {
  const target = options.target ?? globalThis;
  // Undefined means "never probed", which reads as offline for the gate and
  // fires onChange on the first verdict, so surfaces do not sit in a
  // not-knows-yet state after a reload.
  let lastVerdict: boolean | undefined;

  function apply(next: boolean): void {
    if (lastVerdict === next) return;
    lastVerdict = next;
    options.onChange(next);
  }

  // An "offline" event can only make the desk more conservative, so it is
  // believed directly. An "online" event is the one that lies.
  function onOffline(): void {
    apply(false);
  }

  async function onOnline(): Promise<void> {
    apply(await probeSafely());
  }

  async function probeSafely(): Promise<boolean> {
    try {
      return await options.probe();
    } catch {
      return false;
    }
  }

  return {
    start(): void {
      target.addEventListener("online", onOnline);
      target.addEventListener("offline", onOffline);
    },
    stop(): void {
      target.removeEventListener("online", onOnline);
      target.removeEventListener("offline", onOffline);
    },
    async checkNow(): Promise<boolean> {
      const reachable = await probeSafely();
      apply(reachable);
      return reachable;
    },
    isOnline(): boolean {
      return lastVerdict === true;
    },
  };
}
