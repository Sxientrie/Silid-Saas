/**
 * The data port and its production adapter (as-caller PostgREST).
 *
 * The routers depend ONLY on the narrow port below; the adapter wires it
 * to a Supabase client authenticated WITH THE CALLER'S ACCESS TOKEN, so
 * every query runs as the caller and Postgres Row-Level Security (Layer 3,
 * spec/multi-tenancy.md §3) stays the non-bypassable backstop. No elevated
 * credential ever appears in this package.
 *
 * Rows are validated into the @silid/schemas views at the boundary — a
 * response that does not match the schema fails closed. (The same
 * snake_case → camelCase mappers are exported pure for deterministic
 * tests.)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import {
  branchWithRateConfigSchema,
  rateConfigSchema,
  roomViewSchema,
  sessionViewSchema,
  staffViewSchema,
  type BranchWithRateConfig,
  type RateConfig,
  type RoomView,
  type SessionView,
  type StaffView,
} from "@silid/schemas";

/** The narrow data surface the tRPC routers are allowed to know about. */
export interface SilidDataClient {
  listBranches(): Promise<BranchWithRateConfig[]>;
  getBranch(branchId: string): Promise<BranchWithRateConfig | null>;
  listRooms(branchIds: string[]): Promise<RoomView[]>;
  listStaff(): Promise<StaffView[]>;
  listSessions(branchIds: string[]): Promise<SessionView[]>;
  updateRateConfig(
    branchId: string,
    canteenOverrides: Record<string, string> | undefined,
    extensionOverrides: Record<string, string> | undefined,
  ): Promise<RateConfig>;
}

type Row = Record<string, unknown>;

/**
 * Map a PostgREST row (snake_case columns) into the camelCase view shape
 * and validate it against the @silid/schemas schema — fail closed on any
 * row the schema refuses.
 */
function parseOrThrow<T>(schema: ZodType<T>, view: unknown, table: string): T {
  const parsed = schema.safeParse(view);
  if (!parsed.success) {
    throw new Error(`row from ${table} does not match its schema: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function toBranchView(row: Row): BranchWithRateConfig {
  return parseOrThrow(
    branchWithRateConfigSchema,
    { id: row.id, orgId: row.org_id, name: row.name, createdAt: row.created_at, rateConfig: row.rate_config },
    "branches",
  );
}
export function toRoomView(row: Row): RoomView {
  return parseOrThrow(
    roomViewSchema,
    { id: row.id, orgId: row.org_id, branchId: row.branch_id, roomNumber: row.room_number, status: row.status },
    "rooms",
  );
}
export function toStaffView(row: Row): StaffView {
  return parseOrThrow(
    staffViewSchema,
    {
      id: row.id,
      orgId: row.org_id,
      branchId: row.branch_id,
      email: row.email,
      role: row.role,
      displayName: row.display_name,
      isActive: row.is_active,
    },
    "staff",
  );
}
export function toSessionView(row: Row): SessionView {
  return parseOrThrow(
    sessionViewSchema,
    {
      id: row.id,
      orgId: row.org_id,
      branchId: row.branch_id,
      roomId: row.room_id,
      cashierId: row.cashier_id,
      bookingType: row.booking_type,
      pax: row.pax,
      baseRate: row.base_rate,
      surcharges: row.surcharges,
      total: row.total,
      checkedInAt: row.checked_in_at,
      bookedEndAt: row.booked_end_at,
      checkedOutAt: row.checked_out_at,
      status: row.status,
      voidReason: row.void_reason,
    },
    "sessions",
  );
}

export function toRateConfig(row: unknown): RateConfig {
  return parseOrThrow(rateConfigSchema, row, "branches.rate_config");
}

/**
 * Wrap an as-caller Supabase client into the data port. Every call the
 * adapter makes therefore executes under the caller's JWT — RLS derives
 * scope from the claims, never from request data.
 */
export function createSilidDataClient(client: SupabaseClient): SilidDataClient {
  return {
    async listBranches() {
      const { data, error } = await client.from("branches").select("*").order("name");
      if (error !== null) {
        throw new Error(error.message);
      }
      return ((data ?? []) as Row[]).map(toBranchView);
    },
    async getBranch(branchId: string) {
      const { data, error } = await client.from("branches").select("*").eq("id", branchId).maybeSingle();
      if (error !== null) {
        throw new Error(error.message);
      }
      return data === null ? null : toBranchView(data);
    },
    async listRooms(branchIds: string[]) {
      const { data, error } = await client
        .from("rooms")
        .select("*")
        .in("branch_id", branchIds)
        .order("room_number");
      if (error !== null) {
        throw new Error(error.message);
      }
      return ((data ?? []) as Row[]).map(toRoomView);
    },
    async listStaff() {
      const { data, error } = await client.from("staff").select("*").order("display_name");
      if (error !== null) {
        throw new Error(error.message);
      }
      return ((data ?? []) as Row[]).map(toStaffView);
    },
    async listSessions(branchIds: string[]) {
      const { data, error } = await client
        .from("sessions")
        .select("*")
        .in("branch_id", branchIds)
        .order("checked_in_at", { ascending: false });
      if (error !== null) {
        throw new Error(error.message);
      }
      return ((data ?? []) as Row[]).map(toSessionView);
    },
    async updateRateConfig(branchId, canteenOverrides, extensionOverrides) {
      const { data, error } = await client.rpc("update_rate_config", {
        row_branch_id: branchId,
        canteen_overrides: canteenOverrides ?? {},
        extension_overrides: extensionOverrides ?? {},
      });
      if (error !== null) {
        throw new Error(error.message);
      }
      return toRateConfig(data);
    },
  };
}

export type { SupabaseClient };
