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

  it("surfaces the error message of every read and write method", async () => {
    const failing = {
      from: () => {
        const fail = async () => ({ data: null, error: { message: "rls refused the row" } });
        return {
          select: () => ({
            eq: () => ({ maybeSingle: fail }),
            in: () => ({ order: fail }),
            order: fail,
          }),
        };
      },
      rpc: async () => ({ data: null, error: { message: "rpc refused" } }),
    } as unknown as SupabaseClient;
    const data = createSilidDataClient(failing);
    await expect(data.getBranch(BRANCH)).rejects.toThrow("rls refused the row");
    await expect(data.listRooms([BRANCH])).rejects.toThrow("rls refused the row");
    await expect(data.listStaff()).rejects.toThrow("rls refused the row");
    await expect(data.listSessions([BRANCH])).rejects.toThrow("rls refused the row");
    await expect(data.listBranches()).rejects.toThrow("rls refused the row");
    await expect(data.updateRateConfig(BRANCH, undefined, undefined)).rejects.toThrow("rpc refused");
  });

  it("passes the exact query shapes the tables require", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const tableRows: Record<string, unknown> = { branches: branchRow, rooms: roomRow, sessions: sessionRow };
    const client = {
      from(table: string) {
        const step: Record<string, unknown> = { table };
        seen.push(step);
        const record = (key: string, value: unknown) => {
          step[key] = value;
          return {
            eq: (col: string, v: string) => {
              step.eq = { col, v };
              return { maybeSingle: async () => ({ data: branchRow, error: null }) };
            },
            in: (col: string, ids: string[]) => {
              step.in = { col, ids };
              return { order: (col2: string, opts: { ascending: boolean }) => {
                step.orderAfterIn = { col: col2, ...opts };
                return Promise.resolve({ data: [tableRows[table]], error: null });
              } };
            },
            order: (col: string) => {
              step.order = col;
              return Promise.resolve({ data: [branchRow], error: null });
            },
          };
        };
        return { select: () => record("select", "*") };
      },
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        seen.push({ rpc: "update_rate_config", args });
        return { data: branchRow.rate_config, error: null };
      },
    } as unknown as SupabaseClient;
    const data = createSilidDataClient(client);
    await data.listBranches();
    await data.getBranch(BRANCH);
    await data.listRooms([BRANCH]);
    await data.listSessions([BRANCH]);
    await data.updateRateConfig(BRANCH, { bottled_water: "35" }, { grace_minutes: "0" });

    expect(seen[0]).toMatchObject({ table: "branches", order: "name" });
    expect(seen[1]).toMatchObject({ table: "branches", eq: { col: "id", v: BRANCH } });
    expect(seen[2]).toMatchObject({ table: "rooms", in: { col: "branch_id", ids: [BRANCH] }, orderAfterIn: { col: "room_number" } });
    expect(seen[3]).toMatchObject({ table: "sessions", in: { col: "branch_id", ids: [BRANCH] }, orderAfterIn: { col: "checked_in_at", ascending: false } });
    expect(seen[4]).toMatchObject({
      rpc: "update_rate_config",
      args: { row_branch_id: BRANCH, canteen_overrides: { bottled_water: "35" }, extension_overrides: { grace_minutes: "0" } },
    });
  });

  it("getBranch resolves to null when the scoped lookup finds no row", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await createSilidDataClient(client).getBranch(BRANCH)).toBeNull();
  });
});
