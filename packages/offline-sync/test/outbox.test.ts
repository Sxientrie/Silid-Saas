import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SilidOfflineDb } from "../src/db";
import { drain, enqueue, listReplayable, newIdempotencyKey, TransportFailure, type OutboundWrite } from "../src/outbox";
import { submitWrite } from "../src/write-contract";

/**
 * Deliverable 2 — the write contract (spec/offline-sync.md §2), and the
 * crash-safety the Definition of done demands: "the outbox holds entries
 * durably before the UI reports success of queueing".
 */
describe("the outbox write contract", () => {
  let db: SilidOfflineDb;
  let name: string;

  beforeEach(async () => {
    name = `test-outbox-${Math.random().toString(36).slice(2)}`;
    db = new SilidOfflineDb(name);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("gives every entry a client-generated idempotency key", async () => {
    const entry = await enqueue(db, { procedure: "check_in", payload: { roomId: "room-1" } });
    // Pinned to the RFC 4122 version-4 shape: the version and variant bits
    // are set here rather than left to the platform's randomUUID, which is
    // unavailable outside a secure context.
    expect(entry.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it("hexes every byte to two characters, because the server coalesces on this key", () => {
    // The zero padding is a correctness requirement, not formatting. Unpadded
    // hex is ambiguous: the byte arrays [0x01, 0x23] and [0x12, 0x03] both
    // render "123", so two different actions could produce one key and the
    // server would coalesce them into a single accepted write.
    //
    // The bytes are stubbed because a real CSPRNG produces a byte below 0x10
    // only about half the time, which left this test killing the unpadded
    // mutant by luck rather than by assertion.
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint8Array).fill(0x01);
      return array;
    });
    try {
      // All 0x01 bytes, so the version nibble lands on byte 6 (0x41) and the
      // variant on byte 8 (0x81): the third group starts with the 4.
      expect(newIdempotencyKey()).toBe("01010101-0101-4101-8101-010101010101");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("records the local enqueue instant as metadata, never as an authoritative field", async () => {
    const entry = await enqueue(db, {
      procedure: "check_in",
      payload: { roomId: "room-1" },
      now: () => new Date("2026-09-26T09:00:00.000Z"),
    });

    expect(entry.enqueuedAt).toBe("2026-09-26T09:00:00.000Z");
    // The row carries no server-owned timestamp at all: the only instant on
    // it is the client's, and the server re-seals time at accept
    // (spec/offline-sync.md §2.3, Invariant 2a).
    const timestamps = Object.keys(entry).filter((key) => /At$|at$/.test(key));
    expect(timestamps).toEqual(["enqueuedAt"]);
  });

  it("sends the enqueue instant namespaced as client metadata, never as a server field", async () => {
    const sent: OutboundWrite[] = [];
    await enqueue(db, { procedure: "check_in", payload: { roomId: "room-1" } });
    await drain(db, async (write) => {
      sent.push(write);
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.clientMetadata).toMatchObject({ enqueuedAt: expect.any(String) });
    // A caller that tries to smuggle an authoritative timestamp in the
    // payload is sending it as a plain input; the envelope has no field the
    // server could mistake for its own clock.
    expect(Object.keys(sent[0] ?? {}).sort()).toEqual([
      "clientMetadata",
      "idempotencyKey",
      "payload",
      "procedure",
    ]);
  });

  it("is durable before the caller is told anything: a fresh connection sees the row", async () => {
    const outcome = await submitWrite(db, {
      procedure: "check_in",
      payload: { roomId: "room-1" },
      send: async () => {
        throw new TransportFailure("network down");
      },
      now: () => new Date("2026-09-26T09:00:00.000Z"),
    });

    expect(outcome.status).toBe("queued");

    // Close the connection entirely and open a new one against the same
    // database name — the stand-in for a crashed or power-cut desk. A row
    // that only existed in the writing connection's memory would be gone.
    db.close();
    const reopened = new SilidOfflineDb(name);
    await reopened.open();
    try {
      const rows = await reopened.outbox.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.payload).toEqual({ roomId: "room-1" });
      expect(rows[0]?.enqueuedAt).toBe("2026-09-26T09:00:00.000Z");
    } finally {
      reopened.close();
    }
  });

  it("drains oldest-first, in the order the actions were taken", async () => {
    const order: string[] = [];
    await enqueue(db, { procedure: "check_in", payload: { seq: 1 } });
    await enqueue(db, { procedure: "check_in", payload: { seq: 2 } });
    await enqueue(db, { procedure: "check_in", payload: { seq: 3 } });

    await drain(db, async (write) => {
      order.push(String((write.payload as { seq: number }).seq));
    });

    expect(order).toEqual(["1", "2", "3"]);
  });

  it("coalesces a duplicate replay to one row via the idempotency key", async () => {
    const server = new Map<string, { receivedAt: string }>();
    await enqueue(db, { procedure: "check_in", payload: { roomId: "room-1" } });

    const send = async (write: OutboundWrite) => {
      const existing = server.get(write.idempotencyKey);
      if (existing) return existing; // the server coalesces on the key
      const row = { receivedAt: "2026-09-26T10:00:00.000Z" };
      server.set(write.idempotencyKey, row);
      return row;
    };

    const first = await drain(db, send);
    expect(first.drained).toBe(1);
    expect(server.size).toBe(1);
    const originalKey = [...server.keys()][0]!;

    // The crash-after-send case: the desk never learned the first attempt
    // landed, so it queues the same action again under the same key. The
    // server coalesces, and one row exists.
    await enqueue(db, {
      procedure: "check_in",
      payload: { roomId: "room-1" },
      idempotencyKey: originalKey,
    });
    const second = await drain(db, send);
    expect(second.drained).toBe(1);
    expect(server.size).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it("replays an entry that was in flight when the desk died, carrying the same key", async () => {
    const entry = await enqueue(db, { procedure: "check_in", payload: { roomId: "room-1" } });
    await db.outbox.update(entry.id!, { state: "inflight" });

    // An in-flight row is replayable: the send never completed, so the
    // server may or may not have it — the idempotency key settles that.
    const replayable = await listReplayable(db);
    expect(replayable.map((row) => row.idempotencyKey)).toEqual([entry.idempotencyKey]);

    const sent: OutboundWrite[] = [];
    const result = await drain(db, async (write) => {
      sent.push(write);
    });
    expect(sent[0]?.idempotencyKey).toBe(entry.idempotencyKey);
    expect(result.drained).toBe(1);
  });

  it("marks a rejected entry errored and keeps draining the rest", async () => {
    await enqueue(db, { procedure: "check_in", payload: { seq: 1 } });
    await enqueue(db, { procedure: "check_in", payload: { seq: 2 }, idempotencyKey: "poison" });
    await enqueue(db, { procedure: "check_in", payload: { seq: 3 } });

    const seen: number[] = [];
    const result = await drain(db, async (write) => {
      const seq = (write.payload as { seq: number }).seq;
      seen.push(seq);
      if (write.idempotencyKey === "poison") {
        throw new Error("room already occupied for an active session");
      }
    });

    // The poisoned entry did not stall the queue: 1 and 3 still went.
    expect(seen).toEqual([1, 2, 3]);
    expect(result.poisoned).toBe(1);
    expect(result.drained).toBe(2);

    const errored = await db.outbox.where("state").equals("errored").toArray();
    expect(errored).toHaveLength(1);
    expect(errored[0]?.idempotencyKey).toBe("poison");
    expect(errored[0]?.lastError).toContain("already occupied");
    // The stuck entry stays visible to the desk rather than being dropped.
    expect(await db.outbox.count()).toBe(1);
  });

  it("keeps a rejection that is not an Error readable on the row", async () => {
    // A transport or a proxy can throw anything; the desk still has to be
    // able to read why its entry is stuck.
    await enqueue(db, { procedure: "check_in", payload: {}, idempotencyKey: "odd" });
    const result = await drain(db, async () => {
      throw "rate limit exceeded";
    });

    expect(result.poisoned).toBe(1);
    const errored = await db.outbox.where("state").equals("errored").toArray();
    expect(errored[0]?.lastError).toBe("rate limit exceeded");
  });

  it("never re-sends an errored entry", async () => {
    await enqueue(db, { procedure: "check_in", payload: {}, idempotencyKey: "poison" });
    await drain(db, async () => {
      throw new Error("nope");
    });
    expect(await db.outbox.where("state").equals("errored").count()).toBe(1);

    const again = await drain(db, async () => {
      throw new Error("should not be called");
    });
    expect(again.drained).toBe(0);
    expect(again.poisoned).toBe(0);
    expect(again.remaining).toBe(1);
  });

  it("stops on a transport failure and leaves the rest pending for the next drain", async () => {
    await enqueue(db, { procedure: "check_in", payload: { seq: 1 } });
    await enqueue(db, { procedure: "check_in", payload: { seq: 2 } });
    await enqueue(db, { procedure: "check_in", payload: { seq: 3 } });

    const seen: number[] = [];
    const result = await drain(db, async (write) => {
      const seq = (write.payload as { seq: number }).seq;
      seen.push(seq);
      // The connection dies on the second entry: the server is simply not
      // reachable, so trying the third would only produce the same answer.
      if (seq === 2) throw new TransportFailure("connection reset");
    });

    expect(seen).toEqual([1, 2]);
    expect(result.drained).toBe(1);
    expect(result.poisoned).toBe(0);
    expect(result.stoppedByTransport).toBe(true);
    // Entry 2 returns to pending (not errored) so the next drain retries it;
    // entry 3 was never attempted.
    expect(await db.outbox.where("state").equals("pending").count()).toBe(2);
    expect(await db.outbox.where("state").equals("errored").count()).toBe(0);
  });

  it("names the one failure class that makes a write queueable", () => {
    // The name is what a log line, the desk's diagnostics panel, and a
    // cross-tab debugger read. An unnamed subclass is indistinguishable from
    // a plain Error in all three, which is exactly when a cashier needs to
    // know their write is safe in the queue.
    const failure = new TransportFailure("connection reset", { cause: "ECONNRESET" });
    expect(failure.name).toBe("TransportFailure");
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe("connection reset");
    expect(failure.cause).toBe("ECONNRESET");
  });

  it("marks the row in flight and counts the attempt before the send is opened", async () => {
    const entry = await enqueue(db, { procedure: "check_in", payload: {} });
    const observed: { state?: string; attempts?: number }[] = [];

    await drain(db, async () => {
      // Read the row from inside the send: this is the only moment the
      // in-flight mark is observable, and it is the moment a desk dies on.
      const row = await db.outbox.get(entry.id!);
      observed.push({ state: row?.state, attempts: row?.attempts });
    });

    // A row left in flight here is replayable next pass, and its attempt is
    // already counted so the desk can show how often it has failed.
    expect(observed).toEqual([{ state: "inflight", attempts: 1 }]);
  });

  it("counts each attempt so a repeatedly failing entry is visible", async () => {
    await enqueue(db, { procedure: "check_in", payload: {}, idempotencyKey: "retry" });
    await drain(db, async () => {
      throw new TransportFailure("down");
    });
    await drain(db, async () => {
      throw new TransportFailure("down");
    });

    const rows = await db.outbox.toArray();
    expect(rows[0]?.attempts).toBe(2);
    expect(rows[0]?.state).toBe("pending");
  });

  it("reports what it did, for the desk's last-synced surface", async () => {
    expect(await drain(db, async () => undefined)).toEqual({
      drained: 0,
      poisoned: 0,
      remaining: 0,
      stoppedByTransport: false,
    });
  });
});

describe("the online-first write wrapper", () => {
  let db: SilidOfflineDb;

  beforeEach(async () => {
    db = new SilidOfflineDb(`test-write-${Math.random().toString(36).slice(2)}`);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("confirms online and leaves nothing in the outbox", async () => {
    const outcome = await submitWrite(db, {
      procedure: "check_in",
      payload: { roomId: "room-1" },
      send: async () => ({ id: "session-1", total: "1250.00" }),
    });

    expect(outcome.status).toBe("confirmed");
    expect(await db.outbox.count()).toBe(0);
  });

  it("queues on a transport failure instead of throwing at the desk", async () => {
    const outcome = await submitWrite(db, {
      procedure: "check_in",
      payload: { roomId: "room-1" },
      send: async () => {
        throw new TransportFailure("network down");
      },
    });

    expect(outcome.status).toBe("queued");
    expect(await db.outbox.count()).toBe(1);
  });

  it("surfaces a server rejection instead of queueing it forever", async () => {
    await expect(
      submitWrite(db, {
        procedure: "check_in",
        payload: { roomId: "room-1" },
        send: async () => {
          throw new Error("room already occupied for an active session");
        },
      }),
    ).rejects.toThrow("already occupied");

    // A rejection is final; queueing it would replay a doomed action on
    // every reconnect.
    expect(await db.outbox.count()).toBe(0);
  });

  it("hands the transport the same key and the same instant it will queue under", async () => {
    const sent: OutboundWrite[] = [];
    const outcome = await submitWrite(db, {
      procedure: "check_in",
      payload: { roomId: "room-1" },
      send: async (write) => {
        sent.push(write);
        throw new TransportFailure("connection reset");
      },
      now: () => new Date("2026-09-26T09:00:00.000Z"),
    });

    expect(sent).toHaveLength(1);
    const write = sent[0]!;
    // The envelope is exactly four fields. Anything else is either a second
    // clock or a server-owned-looking timestamp the server must never accept.
    expect(Object.keys(write).sort()).toEqual([
      "clientMetadata",
      "idempotencyKey",
      "payload",
      "procedure",
    ]);
    expect(write.procedure).toBe("check_in");
    expect(write.payload).toEqual({ roomId: "room-1" });
    expect(write.clientMetadata).toEqual({ enqueuedAt: "2026-09-26T09:00:00.000Z" });
    // A real key is on the wire even when the caller supplied none: the
    // server coalesces replays on it, and the same key has to reach the row.
    expect(write.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    expect(outcome.status).toBe("queued");
    if (outcome.status !== "queued") throw new Error("unreachable");
    // One key, one instant: the send that failed and the queued row are the
    // same action, so a crash between them replays onto the server's coalesce
    // instead of creating a second session.
    expect(outcome.entry.idempotencyKey).toBe(write.idempotencyKey);
    expect(outcome.entry.enqueuedAt).toBe("2026-09-26T09:00:00.000Z");
  });

  it("passes a caller-supplied replay key through to the transport untouched", async () => {
    const sent: OutboundWrite[] = [];
    await submitWrite(db, {
      procedure: "check_in",
      payload: {},
      idempotencyKey: "replay-me",
      send: async (write) => {
        sent.push(write);
        return { id: "session-1" };
      },
    });

    expect(sent[0]?.idempotencyKey).toBe("replay-me");
  });

  it("skips the network entirely when the desk already knows it is offline", async () => {
    let sent = 0;
    const outcome = await submitWrite(db, {
      procedure: "check_in",
      payload: { roomId: "room-1" },
      send: async () => {
        sent += 1;
        return { id: "session-1" };
      },
      isOnline: () => false,
    });

    expect(sent).toBe(0);
    expect(outcome.status).toBe("queued");
    expect(await db.outbox.count()).toBe(1);
  });

  it("lets the server's confirmed money replace the local copy", async () => {
    const outcome = await submitWrite(db, {
      procedure: "check_in",
      payload: { roomId: "room-1", pax: 2 },
      send: async () => ({
        id: "session-1",
        // The server computes guest billing from the branch's current
        // configuration; the desk's inputs are not amounts.
        total: "1250.00",
        receivedAt: "2026-09-26T10:00:00.000Z",
      }),
    });

    expect(outcome.status).toBe("confirmed");
    if (outcome.status !== "confirmed") throw new Error("unreachable");
    const row = outcome.row as { total: string; receivedAt: string };
    expect(row.total).toBe("1250.00");
    expect(row.receivedAt).toBe("2026-09-26T10:00:00.000Z");
  });
});
