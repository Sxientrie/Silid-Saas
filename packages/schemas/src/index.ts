export const SILID_PACKAGE_NAME = "@silid/schemas" as const;

export {
  CANTEEN_ITEM_IDS,
  canteenOverridesSchema,
  extensionOverridesSchema,
  normalizeMoneyText,
  rateConfigSchema,
  readOverstayTriple,
  updateRateConfigInputSchema,
} from "./rate-config.schema.ts";
export type {
  CanteenItemId,
  CanteenOverrides,
  CanteenOverridesInput,
  ExtensionOverrides,
  ExtensionOverridesInput,
  OverrideText,
  OverstayTriple,
  RateConfig,
  UpdateRateConfigInput,
} from "./rate-config.schema.ts";

export { branchViewSchema, branchWithRateConfigSchema } from "./branch.schema.ts";
export type { BranchView, BranchWithRateConfig } from "./branch.schema.ts";

export { ROOM_STATUSES, roomStatusSchema, roomViewSchema } from "./room.schema.ts";
export type { RoomStatus, RoomView } from "./room.schema.ts";

export { STAFF_ROLES, staffRoleSchema, staffViewSchema } from "./staff.schema.ts";
export type { StaffRole, StaffView } from "./staff.schema.ts";

export {
  BOOKING_TYPES,
  SESSION_STATUSES,
  bookingTypeSchema,
  sessionStatusSchema,
  sessionViewSchema,
} from "./session.schema.ts";
export type { BookingTypeValue, SessionStatus, SessionView } from "./session.schema.ts";
