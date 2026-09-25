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
