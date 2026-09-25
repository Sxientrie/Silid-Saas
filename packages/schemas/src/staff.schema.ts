/**
 * Staff domain schemas (spec/data-model.md §1). Staff rows exist only for
 * the tenant roles (cashier / org_admin) — a platform_admin identity has
 * no staff row (spec/authentication.md §2).
 */
import { z } from "zod";

export const STAFF_ROLES = ["cashier", "org_admin"] as const;
export const staffRoleSchema = z.enum(STAFF_ROLES);
export type StaffRole = (typeof STAFF_ROLES)[number];

export const staffViewSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  branchId: z.uuid().nullable(),
  email: z.string(),
  role: staffRoleSchema,
  displayName: z.string(),
  isActive: z.boolean(),
});
export type StaffView = z.output<typeof staffViewSchema>;
