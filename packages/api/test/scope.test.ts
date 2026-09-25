import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertTargetInScope, resolveBranchFilter } from "../src/index.js";
import type { Caller } from "../src/index.js";

/**
 * Layer 1 scope resolution (spec/multi-tenancy.md §2–§3): the caller's
 * org/branch/role come from VERIFIED claims only. A client-supplied branch
 * id is at best redundant and at worst an attack — it can only ever narrow
 * the caller's own scope, never widen it.
 */
const ORG_A = "14000000-0000-4000-8000-000000000001";
const ORG_B = "14000000-0000-4000-8000-000000000002";
const BRANCH_A1 = "24000000-0000-4000-8000-000000000001";
const BRANCH_A2 = "24000000-0000-4000-8000-000000000002";
const BRANCH_B1 = "24000000-0000-4000-8000-000000000101";

function cashier(branchId: string): Caller {
  return { userId: "34000000-0000-4000-8000-000000000001", claims: { role: "cashier", org_id: ORG_A, branch_id: branchId } };
}
function orgAdmin(): Caller {
  return { userId: "34000000-0000-4000-8000-000000000002", claims: { role: "org_admin", org_id: ORG_A, branch_id: null } };
}
function platform(): Caller {
  return { userId: "34000000-0000-4000-8000-000000000003", claims: { role: "platform_admin", org_id: null, branch_id: null } };
}

describe("resolveBranchFilter — claim-derived scope with an optional target selector", () => {
  it("a cashier is always scoped to their own claim branch", () => {
    expect(resolveBranchFilter(cashier(BRANCH_A1), undefined)).toEqual({ kind: "branch", branchId: BRANCH_A1, orgId: ORG_A });
    expect(resolveBranchFilter(cashier(BRANCH_A1), BRANCH_A1)).toEqual({ kind: "branch", branchId: BRANCH_A1, orgId: ORG_A });
  });

  it("a cashier naming another branch — even a sibling in their own org — is refused, never served", () => {
    expect(() => resolveBranchFilter(cashier(BRANCH_A1), BRANCH_A2)).toThrow(TRPCError);
    try {
      resolveBranchFilter(cashier(BRANCH_A1), BRANCH_A2);
    } catch (error) {
      expect((error as TRPCError).code).toBe("FORBIDDEN");
    }
    expect(() => resolveBranchFilter(cashier(BRANCH_A1), BRANCH_B1)).toThrow(TRPCError);
  });

  it("a cashier naming a foreign org's branch is refused", () => {
    expect(() => resolveBranchFilter(cashier(BRANCH_A1), BRANCH_B1)).toThrow(TRPCError);
  });

  it("an org admin without a selector resolves to their whole org", () => {
    expect(resolveBranchFilter(orgAdmin(), undefined)).toEqual({ kind: "org", orgId: ORG_A });
  });

  it("an org admin may target a branch, scoped for org-membership verification", () => {
    expect(resolveBranchFilter(orgAdmin(), BRANCH_A1)).toEqual({ kind: "target", branchId: BRANCH_A1, orgId: ORG_A });
    expect(resolveBranchFilter(orgAdmin(), BRANCH_B1)).toEqual({ kind: "target", branchId: BRANCH_B1, orgId: ORG_A });
  });

  it("the platform tier reaches everywhere by design", () => {
    expect(resolveBranchFilter(platform(), undefined)).toEqual({ kind: "platform" });
    expect(resolveBranchFilter(platform(), BRANCH_B1)).toEqual({ kind: "target", branchId: BRANCH_B1, orgId: null });
  });

  it("an unauthenticated caller is never scoped", () => {
    expect(() => resolveBranchFilter(null, undefined)).toThrow(TRPCError);
    try {
      resolveBranchFilter(null, undefined);
    } catch (error) {
      expect((error as TRPCError).code).toBe("UNAUTHORIZED");
    }
  });

  it("refusing a cashier's foreign-branch selector carries the scope reason", () => {
    try {
      resolveBranchFilter(cashier(BRANCH_A1), BRANCH_B1);
      throw new Error("expected refusal");
    } catch (error) {
      expect((error as TRPCError).message).toBe("scope comes from the session claims, not the request");
    }
  });
});

describe("assertTargetInScope — the verified-target gate", () => {
  const target = { kind: "target", orgId: ORG_A, branchId: BRANCH_A1 } as const;

  it("accepts a visible branch inside the claim org and returns its id", () => {
    expect(assertTargetInScope(target, { orgId: ORG_A })).toBe(BRANCH_A1);
  });

  it("refuses an invisible branch with NOT_FOUND and the honest reason", () => {
    try {
      assertTargetInScope(target, null);
      throw new Error("expected refusal");
    } catch (error) {
      expect((error as TRPCError).code).toBe("NOT_FOUND");
      expect((error as TRPCError).message).toBe("branch not found in the caller's scope");
    }
  });

  it("refuses a branch from another organization with FORBIDDEN and the honest reason", () => {
    try {
      assertTargetInScope(target, { orgId: ORG_B });
      throw new Error("expected refusal");
    } catch (error) {
      expect((error as TRPCError).code).toBe("FORBIDDEN");
      expect((error as TRPCError).message).toBe("branch belongs to another organization");
    }
  });

  it("refuses a non-target decision (a caller-internal misuse) loudly", () => {
    try {
      assertTargetInScope({ kind: "org", orgId: ORG_A } as never, { orgId: ORG_A });
      throw new Error("expected refusal");
    } catch (error) {
      expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      expect((error as TRPCError).message).toBe("no target to verify");
    }
  });

  it("skips the org-membership check only for the platform tier (orgId null)", () => {
    const platformTarget = { kind: "target", orgId: null, branchId: BRANCH_B1 } as const;
    expect(assertTargetInScope(platformTarget, { orgId: ORG_B })).toBe(BRANCH_B1);
  });
});
