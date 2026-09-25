export const SILID_PACKAGE_NAME = "@silid/schemas" as const;

export {
  CANTEEN_ITEM_IDS,
  canteenOverridesSchema,
  extensionOverridesSchema,
  normalizeMoneyText,
  rateConfigSchema,
  readOverstayTriple,
  updateRateConfigInputSchema,
} from "./rate-config.schema.js";
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
} from "./rate-config.schema.js";

export { branchViewSchema, branchWithRateConfigSchema } from "./branch.schema.js";
export type { BranchView, BranchWithRateConfig } from "./branch.schema.js";

export { ROOM_STATUSES, roomStatusSchema, roomViewSchema } from "./room.schema.js";
export type { RoomStatus, RoomView } from "./room.schema.js";

export { STAFF_ROLES, staffRoleSchema, staffViewSchema } from "./staff.schema.js";
export type { StaffRole, StaffView } from "./staff.schema.js";

export {
  BOOKING_TYPES,
  SESSION_STATUSES,
  bookingTypeSchema,
  sessionStatusSchema,
  sessionViewSchema,
} from "./session.schema.js";
export type { BookingTypeValue, SessionStatus, SessionView } from "./session.schema.js";
