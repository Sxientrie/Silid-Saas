/**
 * Room domain schemas (spec/data-model.md §1). Status transitions are
 * server-side only (spec/domain-rules.md §4) — clients only ever read.
 */
import { z } from "zod";

export const ROOM_STATUSES = ["vacant", "occupied", "grace", "overdue"] as const;
export const roomStatusSchema = z.enum(ROOM_STATUSES);
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const roomViewSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  branchId: z.uuid(),
  roomNumber: z.string(),
  status: roomStatusSchema,
});
export type RoomView = z.output<typeof roomViewSchema>;
