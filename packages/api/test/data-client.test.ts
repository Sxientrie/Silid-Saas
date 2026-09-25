import { describe, expect, it, vi } from "vitest";
import {
  createSilidDataClient,
  toBranchView,
  toRateConfig,
  toRoomView,
  toSessionView,
  toStaffView,
} from "../src/data-client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The as-caller adapter's mapping layer: PostgREST rows validate into the
 * @silid/schemas views, and a response that does not match its schema fails
 * closed. (The client itself is a typed stub here — the tenancy behavior of
 * the real path is proven live against Postgres + RLS in
 * contract.live.test.ts, never against a stub.)
 */
const ORG = "14000000-0000-4000-8000-000000000001";
const BRANCH = "24000000-0000-4000-8000-000000000001";
const ROOM = "44000000-0000-4000-8000-000000000001";
const SESSION = "55000000-0000-4000-8000-000000000001";
const STAFF = "34000000-0000-4000-8000-000000000001";

const branchRow = {
  id: BRANCH,
  org_id: ORG,
  name: "Main",
  created_at: "2026-09-25T00:00:00Z",
  rate_config: { extension: { grace_minutes: "25", block_minutes: "60", block_charge: "150" } },
};
const roomRow = { id: ROOM, org_id: ORG, branch_id: BRANCH, room_number: "101", status: "vacant" };
const staffRow = { id: STAFF, org_id: ORG, branch_id: BRANCH, email: "c@x.test", role: "cashier", display_name: "C", is_active: true };
const sessionRow = {
  id: SESSION, org_id: ORG, branch_id: BRANCH, room_id: ROOM, cashier_id: STAFF,
  booking_type: "short_time", pax: 2, base_rate: "0", surcharges: "0", total: "0",
  checked_in_at: "2026-09-25T10:00:00Z", booked_end_at: "2026-09-25T13:00:00Z",
  checked_out_at: null, status: "active", void_reason: null,
};

describe("row mappers — validate at the boundary, fail closed", () => {
  it("maps a branch row into its view with the parsed rate card", () => {
    const view = toBranchView(branchRow);
    expect(view.id).toBe(BRANCH);
    expect(view.orgId).toBe(ORG);
    expect(view.rateConfig?.extension?.grace_minutes).toBe("25");
  });

  it("maps room, staff, and session rows", () => {
    expect(toRoomView(roomRow).roomNumber).toBe("101");
    expect(toStaffView(staffRow).role).toBe("cashier");
    expect(toSessionView(sessionRow).status).toBe("active");
  });

  it("maps a rate_config payload", () => {
    expect(toRateConfig({ extension: { block_charge: "150" } }).extension?.block_charge).toBe("150");
  });

  it("rejects a malformed row instead of passing it through", () => {
    expect(() => toRoomView({ id: ROOM, org_id: ORG, branch_id: BRANCH, room_number: "1", status: "demolished" })).toThrow(/schema/);
    expect(() => toBranchView({ id: "nope" })).toThrow(/schema/);
    expect(() => toStaffView({ ...staffRow, role: "platform_admin" })).toThrow(/schema/);
    expect(() => toSessionView({ ...sessionRow, pax: "two" })).toThrow(/schema/);
    expect(() => toRateConfig(null)).toThrow(/schema/);
  });
});

describe("createSilidDataClient — as-caller query wiring", () => {
  function stubClient(): { client: SupabaseClient; calls: string[] } {
    const calls: string[] = [];
    const tableRows: Record<string, unknown[]> = {
      branches: [branchRow],
      rooms: [roomRow],
      staff: [staffRow],
      sessions: [sessionRow],
    };
    const result = (data: unknown) => ({ data, error: null });
    const client = {
      from(table: string) {
        calls.push(`select:${table}`);
        const rows = tableRows[table] ?? [];
        return {
          select: () => ({
            eq: (_col: string, _v: string) => ({
              maybeSingle: async () => result(rows[0] ?? null),
            }),
            in: (_col: string, _ids: string[]) => ({
              order: () => result(rows),
            }),
            order: () => result(rows),
          }),
        };
      },
      async rpc(fn: string, args: Record<string, unknown>) {
        calls.push(`rpc:${fn}`);
        return result({ extension: args.extension_overrides });
      },
    } as unknown as SupabaseClient;
    return { client, calls };
  }

  it("listBranches and getBranch read branches through the caller client", async () => {
    const { client, calls } = stubClient();
    const data = createSilidDataClient(client);
    const branches = await data.listBranches();
    expect(branches).toHaveLength(1);
    const branch = await data.getBranch(BRANCH);
    expect(branch?.id).toBe(BRANCH);
    expect(calls).toEqual(["select:branches", "select:branches"]);
  });

  it("listRooms passes the claim-derived branch filter to the query", async () => {
    const { client, calls } = stubClient();
    const data = createSilidDataClient(client);
    const rooms = await data.listRooms([BRANCH]);
    expect(rooms).toHaveLength(1);
    expect(calls).toEqual(["select:rooms"]);
  });

  it("listStaff and listSessions map their rows", async () => {
    const { client } = stubClient();
    const data = createSilidDataClient(client);
    expect((await data.listStaff()).map((s) => s.id)).toEqual([STAFF]);
    expect((await data.listSessions([BRANCH])).map((s) => s.id)).toEqual([SESSION]);
  });

  it("updateRateConfig calls the merge RPC with empty objects for absent sections", async () => {
    const rpc = vi.fn(async () => ({ data: { extension: { block_charge: "150" } }, error: null }));
    const client = { rpc } as unknown as SupabaseClient;
    const data = createSilidDataClient(client);
    const config = await data.updateRateConfig(BRANCH, undefined, { block_charge: "150" });
    expect(rpc).toHaveBeenCalledWith("update_rate_config", {
      row_branch_id: BRANCH,
      canteen_overrides: {},
      extension_overrides: { block_charge: "150" },
    });
    expect(config.extension?.block_charge).toBe("150");
  });

  it("surfaces PostgREST errors instead of swallowing them", async () => {
    const failing = {
      from: () => ({ select: () => ({ order: async () => ({ data: null, error: { message: "permission denied" } }) }) }),
    } as unknown as SupabaseClient;
    await expect(createSilidDataClient(failing).listBranches()).rejects.toThrow("permission denied");
  });
});
