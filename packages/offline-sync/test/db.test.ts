import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DB_NAME, SilidOfflineDb } from "../src/db";

/**
 * Deliverable 1 — the local layer (spec/offline-sync.md §1). Three concerns
 * Dexie owns: the read cache (rooms, branch rate configuration, catalogue),
 * the outbox, and the session mirror.
 */
describe("the local Dexie layer", () => {
  let db: SilidOfflineDb;

  beforeEach(async () => {
    db = new SilidOfflineDb(`test-db-${Math.random().toString(36).slice(2)}`);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("names the desk database so every desk machine keeps its own local layer", () => {
    expect(DEFAULT_DB_NAME).toBe("silid-frontdesk");
  });

  it("exposes the read cache, the outbox, and the session mirror", async () => {
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      "catalogue",
      "outbox",
      "rateConfigs",
      "rooms",
      "sessionMirror",
    ]);
  });

  it("caches rooms, rate configuration, and catalogue prices without a network", async () => {
    await db.rooms.put({
      id: "room-1",
      branchId: "branch-1",
      roomNumber: "1",
      status: "vacant",
      cachedAt: "2026-09-26T00:00:00.000Z",
    });
    await db.rateConfigs.put({
      branchId: "branch-1",
      rateConfig: { base: "500" },
      cachedAt: "2026-09-26T00:00:00.000Z",
    });
    await db.catalogue.put({
      id: "canteen-1",
      branchId: "branch-1",
      name: "Rice",
      price: "60",
      cachedAt: "2026-09-26T00:00:00.000Z",
    });

    expect(await db.rooms.count()).toBe(1);
    expect((await db.rateConfigs.get("branch-1"))?.rateConfig).toEqual({ base: "500" });
    expect((await db.catalogue.where("branchId").equals("branch-1").count())).toBe(1);
  });

  it("indexes roomNumber so the desk can read its cached rooms in that order", async () => {
    for (const roomNumber of ["3", "1", "2"]) {
      await db.rooms.put({
        id: `room-${roomNumber}`,
        branchId: "branch-1",
        roomNumber,
        status: "vacant",
        cachedAt: "2026-09-26T00:00:00.000Z",
      });
    }

    // The desk's own read. An unindexed key path is a Dexie SchemaError at
    // runtime, not a slow query, so this index is part of the contract and
    // the proof surface in the harness would break without it.
    const inRoomOrder = await db.rooms.orderBy("roomNumber").toArray();
    expect(inRoomOrder.map((room) => room.roomNumber)).toEqual(["1", "2", "3"]);
  });

  it("mirrors active sessions so the overstay ladder keeps computing while offline", async () => {
    await db.sessionMirror.put({
      id: "session-1",
      branchId: "branch-1",
      roomId: "room-1",
      checkedInAt: "2026-09-26T00:00:00.000Z",
      bookedEndAt: "2026-09-26T22:00:00.000Z",
      status: "occupied",
    });

    const mirrored = await db.sessionMirror.where("branchId").equals("branch-1").toArray();
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]?.bookedEndAt).toBe("2026-09-26T22:00:00.000Z");
  });

  it("assigns the outbox a monotonic id, so insertion order is replay order", async () => {
    const first = await db.outbox.add({
      idempotencyKey: "key-a",
      procedure: "check_in",
      payload: { roomId: "room-1" },
      enqueuedAt: "2026-09-26T00:00:01.000Z",
      moneyAffecting: true,
      state: "pending",
      attempts: 0,
    });
    const second = await db.outbox.add({
      idempotencyKey: "key-b",
      procedure: "check_in",
      payload: { roomId: "room-2" },
      enqueuedAt: "2026-09-26T00:00:02.000Z",
      moneyAffecting: true,
      state: "pending",
      attempts: 0,
    });

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first!);
    const ordered = await db.outbox.orderBy("id").toArray();
    expect(ordered.map((entry) => entry.idempotencyKey)).toEqual(["key-a", "key-b"]);
  });

  it("refuses a second outbox row for the same idempotency key", async () => {
    const entry = {
      idempotencyKey: "key-duplicate",
      procedure: "check_in",
      payload: {},
      enqueuedAt: "2026-09-26T00:00:01.000Z",
      moneyAffecting: true,
      state: "pending" as const,
      attempts: 0,
    };
    await db.outbox.add(entry);

    // The unique index is what makes a replayed enqueue a no-op instead of
    // a second row that would drain twice.
    await expect(db.outbox.add({ ...entry, payload: { roomId: "other" } })).rejects.toThrow();
    expect(await db.outbox.count()).toBe(1);
  });

  it("indexes the outbox by state, and keeps the money effect queryable without indexing it", async () => {
    await db.outbox.add({
      idempotencyKey: "key-money",
      procedure: "check_in",
      payload: {},
      enqueuedAt: "2026-09-26T00:00:01.000Z",
      moneyAffecting: true,
      state: "pending",
      attempts: 0,
    });
    await db.outbox.add({
      idempotencyKey: "key-note",
      procedure: "note",
      payload: {},
      enqueuedAt: "2026-09-26T00:00:02.000Z",
      moneyAffecting: false,
      state: "pending",
      attempts: 0,
    });

    expect(await db.outbox.where("state").equals("pending").count()).toBe(2);
    // IndexedDB keys may only be number/string/Date/ArrayBuffer/array, so a
    // boolean cannot be an index. The money effect stays a readable boolean
    // on the row and is selected with filter(); the queue is short enough
    // that a scan is the honest trade.
    const money = await db.outbox.filter((entry) => entry.moneyAffecting).toArray();
    expect(money.map((entry) => entry.idempotencyKey)).toEqual(["key-money"]);
  });
});
