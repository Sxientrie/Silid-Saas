/**
 * Session domain schemas (spec/data-model.md §2). Read views only in this
 * phase: sessions are created and transitioned by the named server
 * transitions (check-in, checkout, void), never by client paths.
 */
import { z } from "zod";

export const BOOKING_TYPES = ["short_time", "overnight"] as const;
export const bookingTypeSchema = z.enum(BOOKING_TYPES);
export type BookingTypeValue = (typeof BOOKING_TYPES)[number];

export const SESSION_STATUSES = ["active", "closed", "voided"] as const;
export const sessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const sessionViewSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  branchId: z.uuid(),
  roomId: z.uuid(),
  cashierId: z.uuid(),
  bookingType: bookingTypeSchema,
  pax: z.number().int(),
  /** Sealed at checkout; zeros before sealing are defaults, not figures. */
  baseRate: z.string(),
  surcharges: z.string(),
  total: z.string(),
  checkedInAt: z.string(),
  bookedEndAt: z.string(),
  checkedOutAt: z.string().nullable(),
  status: sessionStatusSchema,
  voidReason: z.string().nullable(),
});
export type SessionView = z.output<typeof sessionViewSchema>;

/**
 * The check-in input (spec/domain-rules.md §2): the room is a client
 * PREFERENCE (first-vacant default with one-tap override), the stay type and
 * guest count are the only money-relevant inputs, and the cashier never types
 * an amount (vault-10). Scope, time, and money are sealed server-side — the
 * strict object is what turns a client-supplied org/branch/cashier/timestamp/
 * peso field into a rejection at the boundary instead of a trusted value.
 * The legal minimum guest count is 1 for both stay types; zero and negative
 * are rejected here at validation, never arithmetic-clamped
 * (spec/domain-rules.md §1.2, §11.5).
 */
export const checkInInputSchema = z.strictObject({
  roomId: z.uuid(),
  bookingType: bookingTypeSchema,
  pax: z.number().int().min(1),
});
export type CheckInInput = z.output<typeof checkInInputSchema>;
