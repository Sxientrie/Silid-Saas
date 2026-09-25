/**
 * The audit_log contract (spec/data-model.md §2; vault-12, vault-17).
 *
 * Actor, time, and (non-platform) org/branch attribution are SERVER facts:
 * the database's app.seal_audit_insert trigger replaces them from the
 * caller's verified claims and the database clock on every claims-bearing
 * insert (proven by supabase/tests/03, "forged audit attribution replaced
 * from claims"). Nothing in this contract accepts them from client-shaped
 * input — a caller supplies only the action, the target, and the optional
 * before/after snapshots.
 *
 * The trail itself is append-only for every role including the platform
 * tier (Invariant 3): no UPDATE/DELETE grant or policy exists at the
 * database layer, and none is offered here.
 */
import { z } from "zod";

/**
 * The action vocabulary — the verbatim strings the system's state changes
 * write. The database transitions (Phase 02), the provisioning/deactivation
 * paths (Phase 03), and the rate-configuration merge (Phase 04) all write
 * through these identifiers; the pgTAP suites assert the exact strings.
 */
export const AUDIT_ACTIONS = Object.freeze({
  check_out: "check_out",
  void_session: "void_session",
  close_shift: "close_shift",
  record_shift_count: "record_shift_count",
  provision_staff: "provision_staff",
  deactivate_staff: "deactivate_staff",
  create_organization: "create_organization",
  set_organization_status: "set_organization_status",
  create_branch: "create_branch",
  update_rate_config: "update_rate_config",
});
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

const jsonSnapshot = z.union([z.record(z.string(), z.unknown()), z.null()]).optional();

export const AUDIT_ACTION_VALUES = Object.values(AUDIT_ACTIONS) as unknown as readonly [
  AuditAction,
  ...AuditAction[],
];

/**
 * The writable part of an audit entry: action, target, snapshots. Strict by
 * design — a forged actor_id/ts/org_id/branch_id key is refused, never
 * honored.
 */
export const auditEntryInputSchema = z.strictObject({
  action: z.enum(AUDIT_ACTION_VALUES),
  targetTable: z.string().min(1),
  targetId: z.uuid(),
  oldData: jsonSnapshot,
  newData: jsonSnapshot,
});
export type AuditEntryInput = z.output<typeof auditEntryInputSchema>;

/** The server-resolved identity of the caller (from VERIFIED claims only). */
export interface AuditIdentity {
  userId: string;
}

/** The insert payload for public.audit_log (snake_case column names). */
export interface AuditEntryPayload {
  actor_id: string;
  action: AuditAction;
  target_table: string;
  target_id: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
}

/**
 * Build the insert payload. actor_id comes from the SERVER-resolved caller
 * identity; ts, org_id, and branch_id are absent — the database seals them
 * (ts default + trigger clock_timestamp(); org/branch from claims, null for
 * platform-tier actions per spec/multi-tenancy.md §5). Any attribution keys
 * smuggled into the input are dropped: the output is constructed field by
 * field, never spread.
 */
export function buildAuditEntry(identity: AuditIdentity, input: AuditEntryInput): AuditEntryPayload {
  const payload: AuditEntryPayload = {
    actor_id: identity.userId,
    action: input.action,
    target_table: input.targetTable,
    target_id: input.targetId,
  };
  if (input.oldData !== undefined) {
    payload.old_data = input.oldData;
  }
  if (input.newData !== undefined) {
    payload.new_data = input.newData;
  }
  return payload;
}

/** The minimal client shape the writer needs (supabase-js compatible). */
export interface AuditClient {
  from(table: string): { insert(payload: AuditEntryPayload): Promise<unknown> };
}

/**
 * Write one audit entry through the caller-authenticated client, so the
 * database's seal trigger and RLS insert policy (actor_id = auth.uid())
 * govern the row. Every state-changing service invokes this — audit
 * writing is infrastructure, not a feature slice
 * (spec/monorepo-structure.md §2).
 */
export async function writeAuditEntry(client: AuditClient, entry: AuditEntryPayload): Promise<unknown> {
  return client.from("audit_log").insert(entry);
}
