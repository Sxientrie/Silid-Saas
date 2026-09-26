import { describe, expect, it } from "vitest";
import { harnessReadSchema } from "../src/lib/harness/read";

/**
 * Deliverable 6 — the harness read surface's schema.
 *
 * The desk parses this payload before it mirrors it into Dexie, so the schema
 * is the only thing standing between a changed server payload and a room cache
 * that quietly holds a shape the desk cannot render.
 */

const SERVE = {
  servedAt: "2026-09-26T12:00:00.000Z",
  acceptedCount: 2,
  rooms: [{ id: "room-101", roomNumber: "101", status: "vacant" }],
};

describe("the harness read schema", () => {
  it("accepts the payload the read route serves", () => {
    expect(harnessReadSchema.safeParse(SERVE).success).toBe(true);
  });

  it("requires the server's own sealed instant", () => {
    // Without servedAt a stale cache hit would be indistinguishable from a
    // fresh read, and "last synced" would be a guess.
    expect(harnessReadSchema.safeParse({ ...SERVE, servedAt: undefined }).success).toBe(false);
  });

  it("refuses a room status the harness read never declared", () => {
    // out_of_service is a real room status in the product; the harness fixture
    // does not use it, so a payload carrying one is a schema failure rather
    // than a room the desk renders wrong.
    const parsed = harnessReadSchema.safeParse({
      ...SERVE,
      rooms: [{ id: "room-101", roomNumber: "101", status: "out_of_service" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a room with no status at all", () => {
    expect(
      harnessReadSchema.safeParse({ ...SERVE, rooms: [{ id: "room-101", roomNumber: "101" }] })
        .success,
    ).toBe(false);
  });

  it("refuses a payload carrying a field the desk would not know what to do with", () => {
    expect(harnessReadSchema.safeParse({ ...SERVE, ratePerNight: "45000" }).success).toBe(false);
  });

  it("refuses a negative accepted count", () => {
    expect(harnessReadSchema.safeParse({ ...SERVE, acceptedCount: -1 }).success).toBe(false);
  });
});
