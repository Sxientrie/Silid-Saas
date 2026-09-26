import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SilidOfflineDb } from "../src/db";
import { enqueue, TransportFailure, type OutboundWrite } from "../src/outbox";
import { countPendingMoneyEntries } from "../src/online-only";
import { CROSS_DESK_POLL_INTERVAL_MS, runReconnect } from "../src/reconnect";
import { submitWrite } from "../src/write-contract";

/**
 * Deliverable 4 — the reconnection path (spec/offline-sync.md §5): "On
 * reconnect: drain the outbox, then refresh the read caches before returning
 * the desk to 'live' status."
 */
describe("the reconnection path", () => {
  it("drains before it refreshes, never the other way round", async () => {
    const order: string[] = [];
    await runReconnect({
      drainOutbox: async () => {
        order.push("drain");
        return { drained: 1, poisoned: 0, remaining: 0, stoppedByTransport: false };
      },
      refreshCaches: async () => {
        order.push("refresh");
      },
    });

    expect(order).toEqual(["drain", "refresh"]);
  });

  it("stamps the last-synced instant only after both steps finished", async () => {
    const stamps: string[] = [];
    const result = await runReconnect({
      drainOutbox: async () => {
        stamps.push("drain");
        return { drained: 2, poisoned: 0, remaining: 0, stoppedByTransport: false };
      },
      refreshCaches: async () => {
        stamps.push("refresh");
      },
      now: () => new Date("2026-09-26T12:00:00.000Z"),
    });

    expect(stamps).toEqual(["drain", "refresh"]);
    expect(result.lastSyncedAt).toBe("2026-09-26T12:00:00.000Z");
    expect(result.drained).toBe(2);
  });

  it("reports a desk that is still not live when the drain lost the connection", async () => {
    const result = await runReconnect({
      drainOutbox: async () => ({
        drained: 0,
        poisoned: 0,
        remaining: 2,
        stoppedByTransport: true,
      }),
      refreshCaches: async () => undefined,
    });

    expect(result.live).toBe(false);
    expect(result.remaining).toBe(2);
  });

  it("reports a live desk when nothing is left queued", async () => {
    const result = await runReconnect({
      drainOutbox: async () => ({
        drained: 3,
        poisoned: 0,
        remaining: 0,
        stoppedByTransport: false,
      }),
      refreshCaches: async () => undefined,
    });

    expect(result.live).toBe(true);
  });

  it("is not live while a stuck entry is left, even though the drain finished", async () => {
    let refreshed = 0;
    const result = await runReconnect({
      drainOutbox: async () => ({
        drained: 1,
        poisoned: 1,
        remaining: 1,
        stoppedByTransport: false,
      }),
      refreshCaches: async () => {
        refreshed += 1;
      },
      now: () => new Date("2026-09-26T12:00:00.000Z"),
    });

    // The pass completed, so the caches were refreshed and the instant is
    // stamped. But a rejected row is still sitting in the outbox waiting for a
    // human, so the desk is not live: "live" means nothing is unresolved, not
    // merely that the last call returned.
    expect(result.live).toBe(false);
    expect(result.remaining).toBe(1);
    expect(result.poisoned).toBe(1);
    expect(refreshed).toBe(1);
    expect(result.lastSyncedAt).toBe("2026-09-26T12:00:00.000Z");
  });

  it("names the cross-desk polling interval the acceptance inputs refer to", () => {
    expect(CROSS_DESK_POLL_INTERVAL_MS).toBe(15_000);
  });
});

describe("the reconnect path against a real outbox", () => {
  let db: SilidOfflineDb;

  beforeEach(async () => {
    db = new SilidOfflineDb(`test-reconnect-${Math.random().toString(36).slice(2)}`);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("drains queued writes, then refreshes the caches, in that order", async () => {
    const order: string[] = [];
    await enqueue(db, { procedure: "check_in", payload: { seq: 1 } });
    await enqueue(db, { procedure: "check_in", payload: { seq: 2 } });

    const accepted: string[] = [];
    const result = await runReconnect({
      drainOutbox: async () => {
        order.push("drain");
        const { drain } = await import("../src/outbox");
        return drain(db, async (write: OutboundWrite) => {
          accepted.push(String((write.payload as { seq: number }).seq));
        });
      },
      refreshCaches: async () => {
        order.push("refresh");
      },
    });

    expect(order).toEqual(["drain", "refresh"]);
    expect(accepted).toEqual(["1", "2"]);
    expect(result.drained).toBe(2);
    expect(await db.outbox.count()).toBe(0);
  });

  it("keeps the caches untouched when the connection is lost again mid-drain", async () => {
    await enqueue(db, { procedure: "check_in", payload: { seq: 1 } });
    let refreshed = 0;

    const result = await runReconnect({
      drainOutbox: async () => {
        const { drain } = await import("../src/outbox");
        return drain(db, async () => {
          throw new TransportFailure("connection reset");
        });
      },
      refreshCaches: async () => {
        refreshed += 1;
      },
    });

    expect(result.live).toBe(false);
    expect(result.remaining).toBe(1);
    // A desk that could not reach the server must not overwrite its read
    // cache with a failed refresh; it keeps showing last-synced state.
    expect(refreshed).toBe(0);
  });

  it("counts the money-affecting entries the gate blocks on", async () => {
    expect(await countPendingMoneyEntries(db)).toBe(0);

    await submitWrite(db, {
      procedure: "check_in",
      payload: { seq: 1 },
      moneyAffecting: true,
      send: async () => {
        throw new TransportFailure("down");
      },
    });
    await submitWrite(db, {
      procedure: "note",
      payload: { seq: 2 },
      send: async () => {
        throw new TransportFailure("down");
      },
    });

    // Only the money-affecting entry holds the shift close.
    expect(await countPendingMoneyEntries(db)).toBe(1);
  });
});
