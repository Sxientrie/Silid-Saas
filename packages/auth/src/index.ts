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
} from "./claims.js";
export type { AppClaims, AppRole } from "./claims.js";

export { supabasePublishableKey, supabaseUrl } from "./env.js";
export { createSilidBrowserClient } from "./client.js";
export { createSilidServerClient } from "./server.js";
export type { CookieAdapter } from "./server.js";
