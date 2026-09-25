import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { createTestCaller, type SilidDataClient } from "../src/index.js";
import type { BranchWithRateConfig, RoomView, SessionView, StaffView } from "@silid/schemas";

/**
 * Deterministic router-contract tests over an in-memory data port: the
 * routers may only ever hand the caller's claim-derived scope to the data
 * layer, and a client-supplied identifier can narrow, never widen, that
 * scope. (The end-to-end proof against real Postgres + RLS lives in
 * contract.live.test.ts; this file pins the API layer's own logic.)
 */
const ORG_A = "14000000-0000-4000-8000-000000000001";
const ORG_B = "14000000-0000-4000-8000-000000000002";
const BRANCH_A1 = "24000000-0000-4000-8000-000000000001";
const BRANCH_A2 = "24000000-0000-4000-8000-000000000002";
const BRANCH_B1 = "24000000-0000-4000-8000-000000000101";
const ROOM_A1 = "44000000-0000-4000-8000-000000000001";
const SESSION_A1 = "55000000-0000-4000-8000-000000000001";
const STAFF_ID = "34000000-0000-4000-8000-000000000001";

const branchRow = (id: string, orgId: string): BranchWithRateConfig => ({
  id,
  orgId,
  name: `branch ${id}`,
  createdAt: "2026-09-25T00:00:00Z",
  rateConfig: { extension: { grace_minutes: "25", block_minutes: "60", block_charge: "150" } },
});

function roomView(branchId: string): RoomView {
  return { id: ROOM_A1, orgId: ORG_A, branchId, roomNumber: "101", status: "vacant" };
}
function sessionView(branchId: string): SessionView {
  return {
    id: SESSION_A1,
    orgId: ORG_A,
    branchId,
    roomId: ROOM_A1,
    cashierId: STAFF_ID,
    bookingType: "short_time",
    pax: 2,
    baseRate: "0",
    surcharges: "0",
    total: "0",
    checkedInAt: "2026-09-25T10:00:00Z",
    bookedEndAt: "2026-09-25T13:00:00Z",
    checkedOutAt: null,
    status: "active",
    voidReason: null,
  };
}
function staffView(): StaffView {
  return { id: STAFF_ID, orgId: ORG_A, branchId: BRANCH_A1, email: "c@x.test", role: "cashier", displayName: "Cashier", isActive: true };
}

/** In-memory port that records every branch filter it is handed. */
function memoryDataClient(): SilidDataClient & { roomFilters: string[][]; sessionFilters: string[][]; rateCalls: unknown[] } {
  const branchRows = [branchRow(BRANCH_A1, ORG_A), branchRow(BRANCH_A2, ORG_A), branchRow(BRANCH_B1, ORG_B)];
  const roomFilters: string[][] = [];
  const sessionFilters: string[][] = [];
  const rateCalls: unknown[] = [];
  const client = {
    roomFilters,
    sessionFilters,
    rateCalls,
    async listBranches() {
      return branchRows;
    },
    async getBranch(branchId: string) {
      return branchRows.find((branch) => branch.id === branchId) ?? null;
    },
    async listRooms(branchIds: string[]) {
      roomFilters.push([...branchIds]);
      return branchIds.map(roomView);
    },
    async listStaff() {
      return [staffView()];
    },
    async listSessions(branchIds: string[]) {
      sessionFilters.push([...branchIds]);
      return branchIds.map(sessionView);
    },
    async updateRateConfig(branchId: string, canteen: unknown, extension: unknown) {
      rateCalls.push([branchId, canteen, extension]);
      return { extension: { ...(extension as Record<string, string>) } };
    },
  };
  return client;
}

function cashierCaller(data?: ReturnType<typeof memoryDataClient>) {
  return createTestCaller(
    {
      userId: STAFF_ID,
      claims: { role: "cashier", org_id: ORG_A, branch_id: BRANCH_A1 },
    },
    data ?? memoryDataClient(),
  );
}
function orgAdminCaller(data?: ReturnType<typeof memoryDataClient>) {
  return createTestCaller(
    {
      userId: "34000000-0000-4000-8000-000000000002",
      claims: { role: "org_admin", org_id: ORG_A, branch_id: null },
    },
    data ?? memoryDataClient(),
  );
}
function platformCaller(data?: ReturnType<typeof memoryDataClient>) {
  return createTestCaller(
    {
      userId: "34000000-0000-4000-8000-000000000003",
      claims: { role: "platform_admin", org_id: null, branch_id: null },
    },
    data ?? memoryDataClient(),
  );
}
function anonymousCaller(data?: ReturnType<typeof memoryDataClient>) {
  return createTestCaller(null, data ?? memoryDataClient());
}

describe("scope never trusts client identifiers (deterministic router contracts)", () => {
  it("a cashier asking for a sibling branch's rooms gets FORBIDDEN and the data layer is never asked", async () => {
    const data = memoryDataClient();
    const caller = cashierCaller(data);
    await expect(caller.rooms.listRooms({ branchId: BRANCH_A2 })).rejects.toThrow(TRPCError);
    await expect(caller.rooms.listRooms({ branchId: BRANCH_B1 })).rejects.toThrow(TRPCError);
    expect(data.roomFilters).toEqual([]);
  });

  it("a cashier with no selector is served their own claim branch only", async () => {
    const data = memoryDataClient();
    const caller = cashierCaller(data);
    const rooms = await caller.rooms.listRooms({});
    expect(data.roomFilters).toEqual([[BRANCH_A1]]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.branchId).toBe(BRANCH_A1);
  });

  it("an org admin asking for another org's branch is refused with no data call", async () => {
    const data = memoryDataClient();
    const caller = orgAdminCaller(data);
    // The refusal code depends on which layer catches it: against the live
    // database the scoped lookup returns nothing (NOT_FOUND, RLS-honest);
    // against this dumb port the membership check refuses (FORBIDDEN).
    await expect(caller.rooms.listRooms({ branchId: BRANCH_B1 })).rejects.toThrow(TRPCError);
    expect(data.roomFilters).toEqual([]);
  });

  it("an org admin may target their own branch", async () => {
    const data = memoryDataClient();
    const caller = orgAdminCaller(data);
    const rooms = await caller.rooms.listRooms({ branchId: BRANCH_A2 });
    expect(data.roomFilters).toEqual([[BRANCH_A2]]);
    expect(rooms.every((room) => room.branchId === BRANCH_A2)).toBe(true);
  });

  it("an org admin with no selector is served their whole org", async () => {
    const data = memoryDataClient();
    const caller = orgAdminCaller(data);
    await caller.rooms.listRooms({});
    expect(data.roomFilters).toEqual([[BRANCH_A1, BRANCH_A2]]);
  });

  it("the platform tier can target any branch by design", async () => {
    const data = memoryDataClient();
    const caller = platformCaller(data);
    const rooms = await caller.rooms.listRooms({ branchId: BRANCH_B1 });
    expect(data.roomFilters).toEqual([[BRANCH_B1]]);
    expect(rooms).toHaveLength(1);
  });

  it("an anonymous caller gets UNAUTHORIZED on every read procedure", async () => {
    const caller = anonymousCaller();
    await expect(caller.rooms.listRooms({})).rejects.toThrow(TRPCError);
    await expect(caller.branches.listBranches()).rejects.toThrow(TRPCError);
    await expect(caller.staff.listStaff()).rejects.toThrow(TRPCError);
    await expect(caller.sessions.listSessions({})).rejects.toThrow(TRPCError);
    await expect(caller.rates.getRateConfig({ branchId: BRANCH_A1 })).rejects.toThrow(TRPCError);
    await expect(caller.rates.updateRateConfig({ branchId: BRANCH_A1 })).rejects.toThrow(TRPCError);
    await expect(caller.catalogue.getDefaultCatalogue()).rejects.toThrow(TRPCError);
  });

  it("procedures without tenant-id inputs refuse any supplied identifier", async () => {
    const caller = orgAdminCaller();
    await expect(
      caller.branches.listBranches({ orgId: ORG_B } as unknown as undefined),
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.staff.listStaff({ orgId: ORG_B } as unknown as undefined),
    ).rejects.toThrow(TRPCError);
  });
});

describe("rate-configuration procedures (merge path contracts)", () => {
  it("updateRateConfig sends the canonical override text through the merge RPC", async () => {
    const data = memoryDataClient();
    const caller = orgAdminCaller(data);
    const result = await caller.rates.updateRateConfig({
      branchId: BRANCH_A1,
      canteenOverrides: { bottled_water: "35" },
      extensionOverrides: { grace_minutes: "0", block_charge: "175.50" },
    });
    expect(data.rateCalls).toEqual([
      [BRANCH_A1, { bottled_water: "35" }, { grace_minutes: "0", block_charge: "175.5" }],
    ]);
    expect(result.extension?.block_charge).toBe("175.5");
  });

  it("updateRateConfig refuses a foreign branch before touching the data layer", async () => {
    const data = memoryDataClient();
    const caller = orgAdminCaller(data);
    await expect(caller.rates.updateRateConfig({ branchId: BRANCH_B1 })).rejects.toThrow(TRPCError);
    expect(data.rateCalls).toEqual([]);
  });

  it("updateRateConfig is an organization-tier surface — a cashier is refused", async () => {
    const data = memoryDataClient();
    const caller = cashierCaller(data);
    await expect(caller.rates.updateRateConfig({ branchId: BRANCH_A1 })).rejects.toThrow(TRPCError);
    expect(data.rateCalls).toEqual([]);
  });

  it("updateRateConfig validates the §3.3 edge set before any write (zero block length)", async () => {
    const data = memoryDataClient();
    const caller = orgAdminCaller(data);
    await expect(
      caller.rates.updateRateConfig({ branchId: BRANCH_A1, extensionOverrides: { block_minutes: "0" } }),
    ).rejects.toThrow(TRPCError);
    expect(data.rateCalls).toEqual([]);
  });

  it("getRateConfig returns the caller's own branch card; a foreign branch is invisible", async () => {
    const data = memoryDataClient();
    const caller = orgAdminCaller(data);
    const own = await caller.rates.getRateConfig({ branchId: BRANCH_A1 });
    expect(own.id).toBe(BRANCH_A1);
    await expect(caller.rates.getRateConfig({ branchId: BRANCH_B1 })).rejects.toThrow(TRPCError);
  });
});

describe("read procedures (branches, staff, sessions)", () => {
  it("listBranches serves only what the caller's scope holds", async () => {
    const data = memoryDataClient();
    const caller = cashierCaller(data);
    const branches = await caller.branches.listBranches();
    expect(branches).toHaveLength(3); // the port returns the visible set; RLS governs the live path
    expect(branches.map((branch) => branch.id)).toContain(BRANCH_A1);
  });

  it("listSessions applies the same claim-derived filter as rooms", async () => {
    const data = memoryDataClient();
    const caller = cashierCaller(data);
    await caller.sessions.listSessions({});
    expect(data.sessionFilters).toEqual([[BRANCH_A1]]);
    await expect(caller.sessions.listSessions({ branchId: BRANCH_A2 })).rejects.toThrow(TRPCError);
    expect(data.sessionFilters).toEqual([[BRANCH_A1]]);
  });

  it("listStaff is claim-scoped with no client filters", async () => {
    const caller = orgAdminCaller();
    const staff = await caller.staff.listStaff();
    expect(staff[0]?.orgId).toBe(ORG_A);
  });
});
