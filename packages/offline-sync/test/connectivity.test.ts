import { describe, expect, it, vi } from "vitest";
import { createConnectivityMonitor, createReachabilityProbe } from "../src/connectivity";

/**
 * Deliverable 4 — reconnection and cache discipline (spec/offline-sync.md §5):
 * "Connectivity detection uses the browser's online/offline events confirmed
 * by a lightweight reachability check — navigator.onLine alone lies on
 * captive networks."
 */
describe("connectivity detection", () => {
  it("trusts a reachability probe over the browser's own opinion", async () => {
    // A captive network reports navigator.onLine === true while nothing
    // upstream is reachable; the probe is the authority.
    const probe = vi.fn(async () => false);
    const monitor = createConnectivityMonitor({ probe, onChange: () => undefined });

    await expect(monitor.checkNow()).resolves.toBe(false);
    expect(monitor.isOnline()).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("reports online when the probe succeeds", async () => {
    const monitor = createConnectivityMonitor({
      probe: async () => true,
      onChange: () => undefined,
    });

    await expect(monitor.checkNow()).resolves.toBe(true);
    expect(monitor.isOnline()).toBe(true);
  });

  it("confirms an 'online' event with a probe rather than believing it", async () => {
    const target = new EventTarget();
    const states: boolean[] = [];
    const probe = vi.fn(async () => false);
    const monitor = createConnectivityMonitor({
      probe,
      onChange: (state) => states.push(state),
      target,
    });
    monitor.start();

    target.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(states).toContain(false));
    // The browser said online, the probe disagreed, and the probe won.
    expect(probe).toHaveBeenCalled();
    expect(monitor.isOnline()).toBe(false);

    monitor.stop();
  });

  it("notifies only on a change of state", async () => {
    const target = new EventTarget();
    const states: boolean[] = [];
    let reachable = true;
    const monitor = createConnectivityMonitor({
      probe: async () => reachable,
      onChange: (state) => states.push(state),
      target,
    });
    monitor.start();

    await monitor.checkNow();
    await monitor.checkNow();
    await monitor.checkNow();
    expect(states).toEqual([true]);

    reachable = false;
    await monitor.checkNow();
    expect(states).toEqual([true, false]);

    monitor.stop();
  });

  it("stops listening once stopped", async () => {
    const target = new EventTarget();
    const states: boolean[] = [];
    let reachable = true;
    const probe = vi.fn(async () => reachable);
    const monitor = createConnectivityMonitor({
      probe,
      onChange: (state) => states.push(state),
      target,
    });
    monitor.start();
    await monitor.checkNow();
    monitor.stop();

    reachable = false;
    target.dispatchEvent(new Event("offline"));
    target.dispatchEvent(new Event("online"));
    await Promise.resolve();
    expect(states).toEqual([true]);
    expect(monitor.isOnline()).toBe(true);
    // Neither listener survived stop(): no probe ran for either event.
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("takes an 'offline' event at face value, without probing", async () => {
    // An offline event can only make the desk more conservative, so it is
    // believed. Probing it would only delay the moment the desk stops
    // trusting a write it cannot confirm.
    const target = new EventTarget();
    const states: boolean[] = [];
    const probe = vi.fn(async () => true);
    const monitor = createConnectivityMonitor({
      probe,
      onChange: (state) => states.push(state),
      target,
    });
    monitor.start();
    await monitor.checkNow();
    expect(states).toEqual([true]);

    target.dispatchEvent(new Event("offline"));
    expect(monitor.isOnline()).toBe(false);
    expect(states).toEqual([true, false]);
    expect(probe).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it("does not re-announce offline once the desk already believes it", async () => {
    const target = new EventTarget();
    const states: boolean[] = [];
    const monitor = createConnectivityMonitor({
      probe: async () => false,
      onChange: (state) => states.push(state),
      target,
    });
    monitor.start();

    target.dispatchEvent(new Event("offline"));
    expect(states).toEqual([false]);

    // The probe then says the same thing it already believed, so the desk is
    // told nothing new. The offline handler has to *record* its verdict, not
    // just report it, or every later probe looks like a fresh change and the
    // cashier sees the same offline notice flash twice.
    await monitor.checkNow();
    expect(states).toEqual([false]);

    monitor.stop();
  });

  it("subscribes to the browser's two events by name and unsubscribes the same handlers", () => {
    // The event names are the contract with the browser: a typo leaves the
    // desk believing it is online because it never hears the branch drop.
    const added: string[] = [];
    const removed: string[] = [];
    const live = new Map<string, EventListener>();
    const target = {
      addEventListener(type: string, handler: EventListener): void {
        added.push(type);
        live.set(type, handler);
      },
      removeEventListener(type: string, handler: EventListener): void {
        removed.push(type);
        if (live.get(type) === handler) live.delete(type);
      },
    } as unknown as EventTarget;

    const monitor = createConnectivityMonitor({
      probe: async () => true,
      onChange: () => undefined,
      target,
    });
    monitor.start();
    expect(added).toEqual(["online", "offline"]);

    monitor.stop();
    expect(removed).toEqual(["online", "offline"]);
    // Both handlers came back by reference, so nothing is left listening.
    expect(live.size).toBe(0);
  });

  it("treats a throwing probe as unreachable rather than online", async () => {
    const monitor = createConnectivityMonitor({
      probe: async () => {
        throw new Error("DNS failure");
      },
      onChange: () => undefined,
    });

    await expect(monitor.checkNow()).resolves.toBe(false);
    expect(monitor.isOnline()).toBe(false);
  });
});

describe("the reachability probe", () => {
  it("succeeds only on a 2xx response", async () => {
    // A null-body status must be constructed with a null body: the Fetch
    // standard makes `new Response(body, { status: 204 })` a TypeError, so the
    // body is omitted here and the verdict still has to be "reachable".
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const probe = createReachabilityProbe("https://desk.example/health", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(probe()).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports unreachable on a server error", async () => {
    const fetchImpl = vi.fn(async () => new Response("down", { status: 503 }));
    const probe = createReachabilityProbe("https://desk.example/health", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(probe()).resolves.toBe(false);
  });

  it("reports unreachable when the request throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const probe = createReachabilityProbe("https://desk.example/health", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(probe()).resolves.toBe(false);
  });

  it("uses a HEAD request so the check stays lightweight", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const probe = createReachabilityProbe("https://desk.example/health", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await probe();

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.method).toBe("HEAD");
    // Bypassing the HTTP cache: a health probe answered from the cache would
    // report the branch as reachable for as long as the entry lives, which is
    // the whole failure the probe exists to catch.
    expect(init?.cache).toBe("no-store");
  });

  it("falls back to the platform fetch when no implementation is injected", async () => {
    const stub = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", stub);
    try {
      const probe = createReachabilityProbe("https://desk.example/health");
      await expect(probe()).resolves.toBe(true);
      expect(stub).toHaveBeenCalledWith(
        "https://desk.example/health",
        expect.objectContaining({ method: "HEAD" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
