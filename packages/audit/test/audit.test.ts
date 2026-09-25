import { describe, expect, it, vi } from "vitest";
import {
  AUDIT_ACTIONS,
  auditEntryInputSchema,
  buildAuditEntry,
  writeAuditEntry,
  type AuditEntryInput,
} from "../src/index.js";

/**
 * spec/data-model.md §2 audit_log contract: actor, time, and (non-platform)
 * org/branch are SERVER facts — derived from the caller's verified claims by
 * the database's seal trigger (app.seal_audit_insert) or the server context.
 * No writer API here accepts them from client-shaped input.
 */
describe("audit action vocabulary", () => {
  it("carries the phase's state-changing action", () => {
    expect(AUDIT_ACTIONS.update_rate_config).toBe("update_rate_config");
  });

  it("names the transitions already proven in the database", () => {
    expect(AUDIT_ACTIONS.check_out).toBe("check_out");
    expect(AUDIT_ACTIONS.void_session).toBe("void_session");
    expect(AUDIT_ACTIONS.close_shift).toBe("close_shift");
    expect(AUDIT_ACTIONS.record_shift_count).toBe("record_shift_count");
    expect(AUDIT_ACTIONS.provision_staff).toBe("provision_staff");
    expect(AUDIT_ACTIONS.deactivate_staff).toBe("deactivate_staff");
    expect(AUDIT_ACTIONS.create_organization).toBe("create_organization");
    expect(AUDIT_ACTIONS.set_organization_status).toBe("set_organization_status");
    expect(AUDIT_ACTIONS.create_branch).toBe("create_branch");
  });

  it("is frozen — the vocabulary cannot drift at runtime", () => {
    expect(Object.isFrozen(AUDIT_ACTIONS)).toBe(true);
  });
});

describe("auditEntryInputSchema — the writable part of the contract", () => {
  it("accepts action, target, and optional snapshots", () => {
    const parsed = auditEntryInputSchema.parse({
      action: "update_rate_config",
      targetTable: "branches",
      targetId: "24000000-0000-4000-8000-000000000001",
      oldData: { extension: { block_charge: "150" } },
      newData: { extension: { block_charge: "175" } },
    });
    expect(parsed.targetTable).toBe("branches");
  });

  it("refuses a forged actor_id, ts, org_id, or branch_id (server facts only)", () => {
    const base: Record<string, unknown> = {
      action: "update_rate_config",
      targetTable: "branches",
      targetId: "24000000-0000-4000-8000-000000000001",
    };
    expect(auditEntryInputSchema.safeParse({ ...base, actor_id: "34000000-0000-4000-8000-000000000009" }).success).toBe(false);
    expect(auditEntryInputSchema.safeParse({ ...base, ts: "1999-01-01T00:00:00Z" }).success).toBe(false);
    expect(auditEntryInputSchema.safeParse({ ...base, org_id: "14000000-0000-4000-8000-000000000001" }).success).toBe(false);
    expect(auditEntryInputSchema.safeParse({ ...base, branch_id: "24000000-0000-4000-8000-000000000001" }).success).toBe(false);
  });

  it("refuses unknown actions and malformed targets", () => {
    const base = { targetTable: "branches", targetId: "24000000-0000-4000-8000-000000000001" };
    expect(auditEntryInputSchema.safeParse({ ...base, action: "delete_everything" }).success).toBe(false);
    expect(auditEntryInputSchema.safeParse({ action: "check_out", targetTable: "sessions", targetId: "nope" }).success).toBe(false);
  });
});

describe("buildAuditEntry — actor from the server identity, never from input", () => {
  const callerId = "34000000-0000-4000-8000-000000000001";

  it("stamps actor_id from the verified caller identity", () => {
    const entry = buildAuditEntry({ userId: callerId }, {
      action: "update_rate_config",
      targetTable: "branches",
      targetId: "24000000-0000-4000-8000-000000000001",
      oldData: { a: 1 },
      newData: { a: 2 },
    });
    expect(entry.actor_id).toBe(callerId);
    expect(entry.action).toBe("update_rate_config");
    expect(entry.target_table).toBe("branches");
    expect(entry.old_data).toEqual({ a: 1 });
    expect(entry.new_data).toEqual({ a: 2 });
  });

  it("carries no client-supplied time — ts is the database's to seal", () => {
    const entry = buildAuditEntry({ userId: callerId }, {
      action: "void_session",
      targetTable: "sessions",
      targetId: "55000000-0000-4000-8000-000000000001",
    } as AuditEntryInput & Record<string, unknown>);
    expect(entry).not.toHaveProperty("ts");
  });

  it("drops any client-shaped attribution smuggled into the input", () => {
    const forged = {
      action: "update_rate_config",
      targetTable: "branches",
      targetId: "24000000-0000-4000-8000-000000000001",
      actor_id: "99999999-0000-4000-8000-999999999999",
      ts: "1999-01-01T00:00:00Z",
      org_id: "14000000-0000-4000-8000-000000000009",
      branch_id: "24000000-0000-4000-8000-000000000009",
    } as unknown as AuditEntryInput;
    const entry = buildAuditEntry({ userId: callerId }, forged);
    expect(entry.actor_id).toBe(callerId);
    expect(entry).not.toHaveProperty("ts");
    expect(entry).not.toHaveProperty("org_id");
    expect(entry).not.toHaveProperty("branch_id");
  });
});

describe("writeAuditEntry — inserts through the caller-authenticated client", () => {
  it("inserts into audit_log with the built payload and passes the client result through", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn().mockReturnValue({ insert }) };
    const result = await writeAuditEntry(client, {
      actor_id: "34000000-0000-4000-8000-000000000001",
      action: "update_rate_config",
      target_table: "branches",
      target_id: "24000000-0000-4000-8000-000000000001",
      old_data: { x: "1" },
      new_data: { x: "2" },
    });
    expect(client.from).toHaveBeenCalledWith("audit_log");
    expect(insert).toHaveBeenCalledWith({
      actor_id: "34000000-0000-4000-8000-000000000001",
      action: "update_rate_config",
      target_table: "branches",
      target_id: "24000000-0000-4000-8000-000000000001",
      old_data: { x: "1" },
      new_data: { x: "2" },
    });
    expect(result).toEqual({ error: null });
  });

  it("propagates the client's error untouched", async () => {
    const failure = { error: { message: "insert refused" } };
    const client = { from: () => ({ insert: vi.fn().mockResolvedValue(failure) }) };
    const result = await writeAuditEntry(client, {
      actor_id: "34000000-0000-4000-8000-000000000001",
      action: "create_branch",
      target_table: "branches",
      target_id: "24000000-0000-4000-8000-000000000001",
    });
    expect(result).toEqual(failure);
  });
});
