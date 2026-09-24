/**
 * Drizzle ORM schema (roadmap 02 Deliverable 11) mirroring the Supabase
 * migrations in supabase/migrations/ verbatim at the table/column/index/
 * check level (spec/monorepo-structure.md §4: migrations themselves remain
 * Supabase-CLI/MCP-generated; drizzle-kit generate is only ever run to
 * VERIFY this schema, never to author database migrations). RLS policies,
 * grants, triggers, and functions are not modeled here — they live in the
 * migrations and are proven by the pgTAP suites.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    planStatus: text("plan_status").notNull().default("reserved"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("organizations_status_check", sql`status in ('active', 'suspended')`),
  ],
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    rateConfig: jsonb("rate_config")
      .notNull()
      .default(sql`'{"addons":{"towel":"20","pillow":"50","blanket":"20","big_foam":"300","bed_sheet":"20","small_foam":"200","extension_charge":"150"},"canteen":{"catalogue":{"bottled_water":{"label":"Bottled Water","price":"30","category":"Drinks & Beers"},"bottled_soft_drinks":{"label":"Bottled Soft Drinks","price":"40","category":"Drinks & Beers"},"coffee":{"label":"Coffee","price":"30","category":"Drinks & Beers"},"juice_in_can":{"label":"Juice in Can","price":"70","category":"Drinks & Beers"},"red_bull":{"label":"Red Bull","price":"80","category":"Drinks & Beers"},"gatorade_500ml":{"label":"Gatorade 500ml","price":"80","category":"Drinks & Beers"},"pale_pilsen_bottled":{"label":"Pale Pilsen Bottled","price":"80","category":"Drinks & Beers"},"san_mig_light_bottled":{"label":"San Mig Light Bottled","price":"80","category":"Drinks & Beers"},"red_horse_500ml":{"label":"Red Horse 500ml","price":"90","category":"Drinks & Beers"},"red_horse_1l":{"label":"Red Horse 1L","price":"170","category":"Drinks & Beers"},"big_curls":{"label":"Big Curls","price":"60","category":"Snacks"},"biscuits":{"label":"Biscuits","price":"20","category":"Snacks"},"fudge_bar":{"label":"Fudge Bar","price":"20","category":"Snacks"},"spicy_bulalo_bulalo":{"label":"Spicy Bulalo / Bulalo","price":"75","category":"Cup Noodles"},"jiampong":{"label":"Jiampong","price":"75","category":"Cup Noodles"},"sotanghon":{"label":"Sotanghon","price":"60","category":"Cup Noodles"},"marlboro_pack":{"label":"Marlboro (pack)","price":"250","category":"Cigars"},"trust_condom":{"label":"Trust Condom","price":"70","category":"Others"},"lighter":{"label":"Lighter","price":"20","category":"Others"},"safeguard":{"label":"Safeguard","price":"25","category":"Others"},"shampoo_conditioner":{"label":"Shampoo / Conditioner","price":"25","category":"Others"},"toothbrush":{"label":"Toothbrush","price":"30","category":"Others"},"toothpaste":{"label":"Toothpaste","price":"20","category":"Others"},"napkin":{"label":"Napkin","price":"20","category":"Others"},"drivemax_coffee":{"label":"Drivemax Coffee","price":"120","category":"Others"},"drivemax_capsule":{"label":"Drivemax Capsule","price":"170","category":"Others"}},"overrides":{}},"extension":{"grace_minutes":"25","block_minutes":"60","block_charge":"150"},"stay_types":{"short_time":{"duration_minutes":"180","base_pax":"2","flat_base":"450","extra_pax_charge":"200"},"overnight":{"duration_minutes":"720","tiers":{"2":"1100","3":"1400","4":"1700"},"surcharge_base_pax":"4","extra_pax_charge":"300"}}}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("branches_org_id_idx").on(table.orgId)],
);

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id").references(() => branches.id),
    email: text("email").notNull(),
    role: text("role").notNull(),
    displayName: text("display_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("staff_org_id_idx").on(table.orgId),
    index("staff_branch_id_idx").on(table.branchId),
    uniqueIndex("staff_org_email_uniq").on(table.orgId, table.email),
    check("staff_role_check", sql`role in ('cashier', 'org_admin', 'platform_admin')`),
    check(
      "staff_role_branch_shape",
      sql`(role = 'cashier' and branch_id is not null) or (role <> 'cashier' and branch_id is null)`,
    ),
  ],
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    roomNumber: text("room_number").notNull(),
    status: text("status").notNull().default("vacant"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rooms_org_id_idx").on(table.orgId),
    index("rooms_branch_id_idx").on(table.branchId),
    uniqueIndex("rooms_branch_room_number_uniq").on(table.branchId, table.roomNumber),
    check("rooms_status_check", sql`status in ('vacant', 'occupied', 'grace', 'overdue')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id),
    cashierId: uuid("cashier_id")
      .notNull()
      .references(() => staff.id),
    bookingType: text("booking_type").notNull(),
    pax: integer("pax").notNull(),
    baseRate: numeric("base_rate").notNull().default("0"),
    surcharges: numeric("surcharges").notNull().default("0"),
    total: numeric("total").notNull().default("0"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    bookedEndAt: timestamp("booked_end_at", { withTimezone: true }).notNull(),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    voidReason: text("void_reason"),
  },
  (table) => [
    index("sessions_org_id_idx").on(table.orgId),
    index("sessions_branch_id_idx").on(table.branchId),
    index("sessions_room_id_idx").on(table.roomId),
    index("sessions_cashier_id_idx").on(table.cashierId),
    uniqueIndex("one_active_session_per_room").on(table.roomId).where(sql`status = 'active'`),
    check("sessions_booking_type_check", sql`booking_type in ('short_time', 'overnight')`),
    check("sessions_pax_check", sql`pax >= 1`),
    check("sessions_base_rate_check", sql`base_rate >= 0`),
    check("sessions_surcharges_check", sql`surcharges >= 0`),
    check("sessions_total_check", sql`total >= 0`),
    check("sessions_status_check", sql`status in ('active', 'closed', 'voided')`),
  ],
);

export const sessionAddons = pgTable(
  "session_addons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    item: text("item").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: numeric("unit_price").notNull(),
    total: numeric("total").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    cashierId: uuid("cashier_id")
      .notNull()
      .references(() => staff.id),
  },
  (table) => [
    index("session_addons_org_id_idx").on(table.orgId),
    index("session_addons_branch_id_idx").on(table.branchId),
    index("session_addons_session_id_idx").on(table.sessionId),
    index("session_addons_cashier_id_idx").on(table.cashierId),
    check("session_addons_qty_check", sql`qty >= 1`),
    check("session_addons_unit_price_check", sql`unit_price >= 0`),
    check("session_addons_total_check", sql`total >= 0`),
  ],
);

export const canteenSales = pgTable(
  "canteen_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    sessionId: uuid("session_id").references(() => sessions.id),
    item: text("item").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: numeric("unit_price").notNull(),
    total: numeric("total").notNull(),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull().defaultNow(),
    cashierId: uuid("cashier_id")
      .notNull()
      .references(() => staff.id),
  },
  (table) => [
    index("canteen_sales_org_id_idx").on(table.orgId),
    index("canteen_sales_branch_id_idx").on(table.branchId),
    index("canteen_sales_session_id_idx").on(table.sessionId),
    index("canteen_sales_cashier_id_idx").on(table.cashierId),
    check("canteen_sales_qty_check", sql`qty >= 1`),
    check("canteen_sales_unit_price_check", sql`unit_price >= 0`),
    check("canteen_sales_total_check", sql`total >= 0`),
  ],
);

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => staff.id),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedBy: uuid("closed_by").references(() => staff.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    expectedRoom: numeric("expected_room").notNull().default("0"),
    expectedAddons: numeric("expected_addons").notNull().default("0"),
    expectedCanteen: numeric("expected_canteen").notNull().default("0"),
    expectedTotal: numeric("expected_total").notNull().default("0"),
    countedTotal: numeric("counted_total"),
    variance: numeric("variance"),
    status: text("status").notNull().default("open"),
  },
  (table) => [
    index("shifts_org_id_idx").on(table.orgId),
    index("shifts_branch_id_idx").on(table.branchId),
    index("shifts_opened_by_idx").on(table.openedBy),
    index("shifts_closed_by_idx").on(table.closedBy),
    uniqueIndex("one_open_shift_per_branch").on(table.branchId).where(sql`status = 'open'`),
    check("shifts_status_check", sql`status in ('open', 'closed')`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id),
    branchId: uuid("branch_id").references(() => branches.id),
    actorId: uuid("actor_id").notNull(),
    action: text("action").notNull(),
    targetTable: text("target_table").notNull(),
    targetId: uuid("target_id").notNull(),
    oldData: jsonb("old_data"),
    newData: jsonb("new_data"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_org_id_idx").on(table.orgId),
    index("audit_log_branch_id_idx").on(table.branchId),
    index("audit_log_target_idx").on(table.targetTable, table.targetId),
  ],
);
