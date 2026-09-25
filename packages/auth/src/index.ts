export const SILID_PACKAGE_NAME = "@silid/auth" as const;

export {
  APP_ROLES,
  appClaimsSchema,
  claimsFromSession,
  claimsFromUser,
  hasRole,
  isCashierClaims,
  isOrgAdminClaims,
  isPlatformAdminClaims,
  parseAppClaims,
  readAppClaims,
} from "./claims";
export type { AppClaims, AppRole } from "./claims";

export { supabasePublishableKey, supabaseUrl } from "./env";
export { createSilidBrowserClient } from "./client";
export { createSilidServerClient } from "./server";
export type { CookieAdapter } from "./server";
