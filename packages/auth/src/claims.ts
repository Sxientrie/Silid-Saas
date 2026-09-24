import { z } from "zod";

/**
 * The ROLES BY TIER identifiers (spec/authentication.md §1), verbatim —
 * snake_case, no ad hoc role strings anywhere else in code or schema.
 */
export const APP_ROLES = ["platform_admin", "org_admin", "cashier"] as const;
export type AppRole = (typeof APP_ROLES)[number];

/**
 * The app_metadata claim shape (spec/authentication.md §2):
 *   platform_admin → org_id and branch_id null (no tenant staff row);
 *   org_admin      → org_id set, branch_id null;
 *   cashier        → both set, pointing at the single operated branch.
 * Authorization reads app_metadata only — user_metadata is user-editable
 * and is never read here (spec/supabase.md §5).
 */
const optionalUuid = z.uuid().nullish().transform((value) => value ?? null);

export const appClaimsSchema = z
  .object({
    role: z.enum(APP_ROLES),
    org_id: optionalUuid,
    branch_id: optionalUuid,
  })
  .superRefine((claims, ctx) => {
    if (claims.role === "platform_admin") {
      if (claims.org_id !== null || claims.branch_id !== null) {
        ctx.addIssue({
          code: "custom",
          message: "platform_admin carries null org_id and branch_id",
        });
      }
      return;
    }
    if (claims.org_id === null) {
      ctx.addIssue({ code: "custom", message: `${claims.role} carries an org_id` });
      return;
    }
    if (claims.role === "org_admin" && claims.branch_id !== null) {
      ctx.addIssue({ code: "custom", message: "org_admin carries a null branch_id" });
    }
    if (claims.role === "cashier" && claims.branch_id === null) {
      ctx.addIssue({ code: "custom", message: "cashier carries a branch_id" });
    }
  });

export type AppClaims = z.infer<typeof appClaimsSchema>;

type AppMetadataCarrier = { app_metadata?: unknown };

/**
 * Parse the claim shape out of an `app_metadata` value. Returns null for
 * anything that does not match the spec shape — a missing or malformed
 * claim never grants a role.
 */
export function readAppClaims(input: unknown): AppClaims | null {
  if (typeof input !== "object" || input === null || !("app_metadata" in input)) {
    return null;
  }
  const parsed = appClaimsSchema.safeParse((input as AppMetadataCarrier).app_metadata);
  return parsed.success ? parsed.data : null;
}

/**
 * Strict variant: throws instead of returning null, for paths where a
 * missing claim must stop the request (server guards, provisioning).
 */
export function parseAppClaims(input: unknown): AppClaims {
  const claims = readAppClaims(input);
  if (claims === null) {
    throw new Error("missing or invalid app_metadata authorization claims");
  }
  return claims;
}

/** Read the claims from a Supabase Auth user record. */
export function claimsFromUser(user: unknown): AppClaims | null {
  return readAppClaims(user);
}

/** Read the claims from a Supabase Auth session record. */
export function claimsFromSession(
  session: { user?: unknown } | null | undefined,
): AppClaims | null {
  if (typeof session !== "object" || session === null || !("user" in session)) {
    return null;
  }
  return claimsFromUser((session as { user?: unknown }).user);
}

export function hasRole(claims: AppClaims | null, role: AppRole): boolean {
  return claims !== null && claims.role === role;
}

export function isPlatformAdminClaims(claims: AppClaims | null): boolean {
  return hasRole(claims, "platform_admin");
}

export function isOrgAdminClaims(claims: AppClaims | null): boolean {
  return hasRole(claims, "org_admin");
}

export function isCashierClaims(claims: AppClaims | null): boolean {
  return hasRole(claims, "cashier");
}
