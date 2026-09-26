import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "../src/app/harness/read/route";
import { harnessDouble } from "../src/lib/harness/instance";
import { harnessReadSchema } from "../src/lib/harness/read";

/**
 * Deliverable 6 — the harness read route.
 *
 * The route is where the desk's read cache gets its two observable facts: the
 * server's own sealed instant, and how much its own ledger has taken. The
 * second one is the proof the reconnect scenario reads ("the caches were
 * refreshed *after* the drain"), so it has to be scoped to the asking desk: the
 * double's ledger is one process-wide array, and a global count made one
 * scenario's number depend on how many writes an earlier scenario made.
 */

function read(run?: string): Request {
  const url = run === undefined ? "http://desk.test/harness/read" : `http://desk.test/harness/read?run=${run}`;
  return new Request(url);
}

function envelope(run: string, seq: number, key = `${run}-${seq}`): unknown {
  return {
    idempotencyKey: key,
    procedure: "harness_note",
    payload: { run, seq },
    clientMetadata: { enqueuedAt: "2026-09-26T09:00:00.000Z" },
  };
}

describe("the harness read route", () => {
  beforeEach(() => {
    harnessDouble.clear();
  });

  it("refuses a read with no run to scope its ledger count to", async () => {
    const response = GET(read());

    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("harness_no_run");
  });

  it("refuses a blank run rather than defaulting to every desk's writes", async () => {
    const response = GET(read("%20"));

    expect(response.status).toBe(400);
  });

  it("counts only the run that asked", async () => {
    harnessDouble.accept(envelope("run-a", 1));
    harnessDouble.accept(envelope("run-a", 2));
    harnessDouble.accept(envelope("run-b", 1));

    const body = harnessReadSchema.parse(await GET(read("run-a")).json());

    expect(body.acceptedCount).toBe(2);
  });

  it("serves rooms and a server-sealed instant the desk can cache", async () => {
    const before = new Date().toISOString();
    const body = harnessReadSchema.parse(await GET(read("run-a")).json());

    expect(body.rooms.map((room) => room.roomNumber)).toEqual(["101", "102", "103"]);
    expect(Date.parse(body.servedAt)).toBeGreaterThanOrEqual(Date.parse(before));
  });

  it("tells the desk not to cache the read at the HTTP layer", async () => {
    // The worker's own NetworkFirst rule is the desk's cache. If the route also
    // let the browser cache it, `servedAt` could age in a way the desk never saw.
    const response = GET(read("run-a"));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
