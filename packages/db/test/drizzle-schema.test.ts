import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "../src/drizzle/schema.js";

const tableEntries = Object.entries(schema).filter(
  (entry): entry is [string, PgTable] => entry[1] instanceof Object && "getSQL" in entry[1],
);

const TABLE_NAMES = [
  "audit_log",
  "branches",
  "canteen_sales",
  "organizations",
  "rooms",
  "session_addons",
  "sessions",
  "shifts",
  "staff",
].sort();

const BRANCH_SCOPED_TABLES = new Set([
  "rooms",
  "sessions",
  "session_addons",
  "canteen_sales",
  "shifts",
  "audit_log",
]);

/** The full column spec, mirrored column-for-column from migration 20260924141037. */
const COLUMN_SPECS: Record<string, Record<string, { type: string; notNull: boolean; hasDefault: boolean }>> = {
  organizations: {
    id: { type: "PgUUID", notNull: true, hasDefault: true },
    name: { type: "PgText", notNull: true, hasDefault: false },
    status: { type: "PgText", notNull: true, hasDefault: true },
    plan_status: { type: "PgText", notNull: true, hasDefault: true },
    created_at: { type: "PgTimestamp", notNull: true, hasDefault: true },
  },
  branches: {
    id: { type: "PgUUID", notNull: true, hasDefault: true },
    org_id: { type: "PgUUID", notNull: true, hasDefault: false },
    name: { type: "PgText", notNull: true, hasDefault: false },
    rate_config: { type: "PgJsonb", notNull: true, hasDefault: true },
    created_at: { type: "PgTimestamp", notNull: true, hasDefault: true },
  },
  staff: {
    id: { type: "PgUUID", notNull: true, hasDefault: false },
    org_id: { type: "PgUUID", notNull: true, hasDefault: false },
    branch_id: { type: "PgUUID", notNull: false, hasDefault: false },
    email: { type: "PgText", notNull: true, hasDefault: false },
    role: { type: "PgText", notNull: true, hasDefault: false },
    display_name: { type: "PgText", notNull: true, hasDefault: false },
    is_active: { type: "PgBoolean", notNull: true, hasDefault: true },
    created_at: { type: "PgTimestamp", notNull: true, hasDefault: true },
  },
  rooms: {
    id: { type: "PgUUID", notNull: true, hasDefault: true },
    org_id: { type: "PgUUID", notNull: true, hasDefault: false },
    branch_id: { type: "PgUUID", notNull: true, hasDefault: false },
    room_number: { type: "PgText", notNull: true, hasDefault: false },
    status: { type: "PgText", notNull: true, hasDefault: true },
    created_at: { type: "PgTimestamp", notNull: true, hasDefault: true },
  },
  sessions: {
    id: { type: "PgUUID", notNull: true, hasDefault: true },
    org_id: { type: "PgUUID", notNull: true, hasDefault: false },
    branch_id: { type: "PgUUID", notNull: true, hasDefault: false },
    room_id: { type: "PgUUID", notNull: true, hasDefault: false },
    cashier_id: { type: "PgUUID", notNull: true, hasDefault: false },
    booking_type: { type: "PgText", notNull: true, hasDefault: false },
    pax: { type: "PgInteger", notNull: true, hasDefault: false },
    base_rate: { type: "PgNumeric", notNull: true, hasDefault: true },
    surcharges: { type: "PgNumeric", notNull: true, hasDefault: true },
    total: { type: "PgNumeric", notNull: true, hasDefault: true },
    checked_in_at: { type: "PgTimestamp", notNull: true, hasDefault: true },
    booked_end_at: { type: "PgTimestamp", notNull: true, hasDefault: false },
    checked_out_at: { type: "PgTimestamp", notNull: false, hasDefault: false },
    status: { type: "PgText", notNull: true, hasDefault: true },
    void_reason: { type: "PgText", notNull: false, hasDefault: false },
  },
  session_addons: {
    id: { type: "PgUUID", notNull: true, hasDefault: true },
    org_id: { type: "PgUUID", notNull: true, hasDefault: false },
    branch_id: { type: "PgUUID", notNull: true, hasDefault: false },
    session_id: { type: "PgUUID", notNull: true, hasDefault: false },
    item: { type: "PgText", notNull: true, hasDefault: false },
    qty: { type: "PgInteger", notNull: true, hasDefault: false },
    unit_price: { type: "PgNumeric", notNull: true, hasDefault: false },
    total: { type: "PgNumeric", notNull: true, hasDefault: false },
    added_at: { type: "PgTimestamp", notNull: true, hasDefault: true },
    cashier_id: { type: "PgUUID", notNull: true, hasDefault: false },
  },
  canteen_sales: {
    id: { type: "PgUUID", notNull: true, hasDefault: true },
    org_id: { type: "PgUUID", notNull: true, hasDefault: false },
    branch_id: { type: "PgUUID", notNull: true, hasDefault: false },
    session_id: { type: "PgUUID", notNull: false, hasDefault: false },
    item: { type: "PgText", notNull: true, hasDefault: false },
    qty: { type: "PgInteger", notNull: true, hasDefault: false },
    unit_price: { type: "PgNumeric", notNull: true, hasDefault: false },
    total: { type: "PgNumeric", notNull: true, hasDefault: false },
    sold_at: { type: "PgTimestamp", notNull: true, hasDefault: true },
    cashier_id: { type: "PgUUID", notNull: true, hasDefault: false },
  },
  shifts: {
    id: { type: "PgUUID", notNull: true, hasDefault: true },
    org_id: { type: "PgUUID", notNull: true, hasDefault: false },
    branch_id: { type: "PgUUID", notNull: true, hasDefault: false },
    opened_by: { type: "PgUUID", notNull: true, hasDefault: false },
    opened_at: { type: "PgTimestamp", notNull: true, hasDefault: true },
    closed_by: { type: "PgUUID", notNull: false, hasDefault: false },
    closed_at: { type: "PgTimestamp", notNull: false, hasDefault: false },
    expected_room: { type: "PgNumeric", notNull: true, hasDefault: true },
    expected_addons: { type: "PgNumeric", notNull: true, hasDefault: true },
    expected_canteen: { type: "PgNumeric", notNull: true, hasDefault: true },
    expected_total: { type: "PgNumeric", notNull: true, hasDefault: true },
    counted_total: { type: "PgNumeric", notNull: false, hasDefault: false },
    variance: { type: "PgNumeric", notNull: false, hasDefault: false },
    status: { type: "PgText", notNull: true, hasDefault: true },
  },
  audit_log: {
    id: { type: "PgUUID", notNull: true, hasDefault: true },
    org_id: { type: "PgUUID", notNull: false, hasDefault: false },
    branch_id: { type: "PgUUID", notNull: false, hasDefault: false },
    actor_id: { type: "PgUUID", notNull: true, hasDefault: false },
    action: { type: "PgText", notNull: true, hasDefault: false },
    target_table: { type: "PgText", notNull: true, hasDefault: false },
    target_id: { type: "PgUUID", notNull: true, hasDefault: false },
    old_data: { type: "PgJsonb", notNull: false, hasDefault: false },
    new_data: { type: "PgJsonb", notNull: false, hasDefault: false },
    ts: { type: "PgTimestamp", notNull: true, hasDefault: true },
  },
};

/** FK counts per table, from the migrations. */
const FK_COUNTS: Record<string, number> = {
  organizations: 0,
  branches: 1,
  staff: 2,
  rooms: 2,
  sessions: 4,
  session_addons: 4,
  canteen_sales: 4,
  shifts: 4,
  audit_log: 2,
};

/** FK targets per table, from the migrations (sorted table names). */
const FK_TARGETS: Record<string, string[]> = {
  organizations: [],
  branches: ["organizations"],
  staff: ["branches", "organizations"],
  rooms: ["branches", "organizations"],
  sessions: ["branches", "organizations", "rooms", "staff"],
  session_addons: ["branches", "organizations", "sessions", "staff"],
  canteen_sales: ["branches", "organizations", "sessions", "staff"],
  shifts: ["branches", "organizations", "staff", "staff"],
  audit_log: ["branches", "organizations"],
};

/** The exact default values the migrations seed, asserted verbatim. */
const DEFAULT_VALUES: Array<[string, string, string]> = [
  ["organizations", "status", "active"],
  ["organizations", "plan_status", "reserved"],
  ["staff", "is_active", "true"],
  ["rooms", "status", "vacant"],
  ["sessions", "status", "active"],
  ["sessions", "base_rate", "0"],
  ["sessions", "surcharges", "0"],
  ["sessions", "total", "0"],
  ["shifts", "status", "open"],
  ["shifts", "expected_room", "0"],
  ["shifts", "expected_addons", "0"],
  ["shifts", "expected_canteen", "0"],
  ["shifts", "expected_total", "0"],
];

const PG_COLUMN_TYPES: Record<string, string> = {
  PgUUID: "uuid",
  PgText: "text",
  PgInteger: "integer",
  PgNumeric: "numeric",
  PgBoolean: "boolean",
  PgJsonb: "jsonb",
  PgTimestamp: "timestamp with time zone",
};
function tableByName(name: string): PgTable {
  const entry = tableEntries.find(([, table]) => getTableConfig(table).name === name);
  if (entry === undefined) {
    throw new Error(`table ${name} is not exported from the schema`);
  }
  return entry[1];
}

function columnNames(table: PgTable): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

function indexNames(table: PgTable): string[] {
  return getTableConfig(table).indexes.map((index) => index.config.name);
}

function checkNames(table: PgTable): string[] {
  return getTableConfig(table).checks.map((check) => check.name);
}

/** Renders a drizzle SQL expression's raw string without the full query builder. */
function renderSql(expression: unknown): string {
  const chunks =
    (expression as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? [];
  return chunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown }).value;
      if (Array.isArray(value)) {
        return value.map((part) => String(part)).join("");
      }
      return String(chunk);
    })
    .join("");
}

describe("drizzle schema mirrors the supabase migrations (Deliverable 11)", () => {
  it("exposes exactly the nine spec tables under their migration names", () => {
    const names = tableEntries.map(([, table]) => getTableConfig(table).name).sort();
    expect(names).toEqual(TABLE_NAMES);
  });

  it("mirrors every column's type, nullability, and default from the migrations", () => {
    for (const [tableName, spec] of Object.entries(COLUMN_SPECS)) {
      const table = tableByName(tableName);
      const config = getTableConfig(table);
      expect(columnNames(table).sort(), `${tableName} columns`).toEqual(
        Object.keys(spec).sort(),
      );
      for (const [columnName, expected] of Object.entries(spec)) {
        const column = config.columns.find((column) => column.name === columnName);
        expect(column?.columnType, `${tableName}.${columnName} type`).toBe(expected.type);
        expect(column?.notNull, `${tableName}.${columnName} not null`).toBe(expected.notNull);
        expect(column?.hasDefault, `${tableName}.${columnName} default`).toBe(expected.hasDefault);
      }
    }
  });

  it("carries org_id on every org-scoped table and branch_id on branch-scoped ones", () => {
    expect(columnNames(tableByName("organizations"))).not.toContain("org_id");
    expect(columnNames(tableByName("branches"))).not.toContain("branch_id");
    expect(columnNames(tableByName("staff"))).toContain("branch_id");
    for (const name of BRANCH_SCOPED_TABLES) {
      expect(columnNames(tableByName(name)), `${name}.branch_id`).toContain("branch_id");
    }
  });

  it("indexes the tenancy columns exactly as the migrations name them", () => {
    for (const name of TABLE_NAMES) {
      if (name === "organizations") {
        continue;
      }
      expect(indexNames(tableByName(name)), `${name}.org_id index`).toContain(`${name}_org_id_idx`);
    }
    for (const name of BRANCH_SCOPED_TABLES) {
      expect(indexNames(tableByName(name)), `${name}.branch_id index`).toContain(
        `${name}_branch_id_idx`,
      );
    }
  });

  it("models every foreign key the migrations declare", () => {
    for (const [tableName, count] of Object.entries(FK_COUNTS)) {
      const foreignKeys = getTableConfig(tableByName(tableName)).foreignKeys;
      expect(foreignKeys, `${tableName} foreign keys`).toHaveLength(count);
    }
  });

  it("carries every column's exact SQL type (timestamptz, numeric, …) from the migrations", () => {
    for (const [tableName, spec] of Object.entries(COLUMN_SPECS)) {
      const config = getTableConfig(tableByName(tableName));
      for (const [columnName, expected] of Object.entries(spec)) {
        const column = config.columns.find((column) => column.name === columnName);
        expect(column?.getSQLType(), tableName + "." + columnName + " sql type").toBe(
          PG_COLUMN_TYPES[expected.type],
        );
      }
    }
  });

  it("defaults carry the migration's exact seed values", () => {
    for (const [tableName, columnName, expected] of DEFAULT_VALUES) {
      const column = getTableConfig(tableByName(tableName)).columns.find(
        (column) => column.name === columnName,
      );
      expect(String(column?.default), tableName + "." + columnName + " default").toBe(expected);
    }
  });

  it("targets every foreign key exactly as the migrations declare", () => {
    for (const [tableName, targets] of Object.entries(FK_TARGETS)) {
      const foreignKeys = getTableConfig(tableByName(tableName)).foreignKeys;
      const actual = foreignKeys
        .map((fk) => getTableName(fk.reference().foreignTable))
        .sort();
      expect(actual, tableName + " foreign key targets").toEqual([...targets].sort());
    }
  });
  it("models the two double-booking and double-shift guards as partial unique indexes", () => {
    const sessions = getTableConfig(tableByName("sessions"));
    const shifts = getTableConfig(tableByName("shifts"));
    const oneActiveSession = sessions.indexes.find(
      (index) => index.config.name === "one_active_session_per_room",
    );
    const oneOpenShift = shifts.indexes.find(
      (index) => index.config.name === "one_open_shift_per_branch",
    );
    expect(oneActiveSession?.config.unique).toBe(true);
    expect(oneOpenShift?.config.unique).toBe(true);
    expect(renderSql(oneActiveSession?.config.where)).toContain("status = 'active'");
    expect(renderSql(oneOpenShift?.config.where)).toContain("status = 'open'");
    // Money columns are never floats: numeric all the way down.
    for (const column of sessions.columns.filter((column) =>
      ["base_rate", "surcharges", "total"].includes(column.name),
    )) {
      expect(column.columnType).toBe("PgNumeric");
    }
  });

  it("names the check constraints after their migration counterparts", () => {
    expect(checkNames(tableByName("sessions"))).toEqual(
      expect.arrayContaining([
        "sessions_booking_type_check",
        "sessions_pax_check",
        "sessions_status_check",
      ]),
    );
    expect(checkNames(tableByName("staff"))).toEqual(
      expect.arrayContaining(["staff_role_check", "staff_role_branch_shape"]),
    );
    expect(checkNames(tableByName("rooms"))).toContain("rooms_status_check");
    expect(checkNames(tableByName("shifts"))).toContain("shifts_status_check");
    expect(checkNames(tableByName("organizations"))).toContain("organizations_status_check");
  });

  it("seeds the branches.rate_config default from the money reference card", () => {
    const rateConfig = getTableConfig(tableByName("branches")).columns.find(
      (column) => column.name === "rate_config",
    );
    const defaultText = renderSql(rateConfig?.default);
    expect(defaultText).toContain("flat_base");
    expect(defaultText).toContain("grace_minutes");
    expect(defaultText).toContain("block_charge");
    expect(defaultText).toContain("bottled_water");
    expect(defaultText).toContain("drivemax_capsule");
    expect(defaultText).toContain("extension_charge");
  });

  it("leaves audit_log attribution nullable only for platform-tier rows", () => {
    const audit = getTableConfig(tableByName("audit_log"));
    expect(audit.columns.find((column) => column.name === "actor_id")?.notNull).toBe(true);
    expect(indexNames(tableByName("audit_log"))).toContain("audit_log_target_idx");
  });
});
