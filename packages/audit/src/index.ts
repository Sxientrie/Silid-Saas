export const SILID_PACKAGE_NAME = "@silid/audit" as const;

export {
  AUDIT_ACTIONS,
  auditEntryInputSchema,
  buildAuditEntry,
  writeAuditEntry,
} from "./audit.js";
export type {
  AuditAction,
  AuditClient,
  AuditEntryInput,
  AuditEntryPayload,
  AuditIdentity,
} from "./audit.js";
