/**
 * Layer 1 — session-derived scope resolution (spec/multi-tenancy.md §2–§3).
 *
 * The caller's org, branch, and role come from VERIFIED session claims
 * (app_metadata; @silid/auth). Tenant identifiers are never accepted from
 * clients: a request naming an org/branch is at best redundant and at worst
 * an attack (§2). A client-supplied branch id can therefore only ever be a
 * target SELECTOR inside the caller's claim scope — the decisions below are
 * computed from claims alone, and a requested id either narrows the caller's
 * own scope (after membership verification) or is refused.
 */
import { TRPCError } from "@trpc/server";
import type { Caller } from "./context";

/**
 * The claim-derived branch scope of one request:
 *   branch   — the caller's own claim branch (cashier);
 *   org      — the caller's whole organization (org tier, no selector);
 *   target   — a client-named branch to verify against the caller's scope
 *              before use (never trusted on its own);
 *   platform — the platform tier, which reaches all organizations by
 *              design (spec/multi-tenancy.md §2).
 */
export type BranchScopeDecision =
  | { kind: "branch"; orgId: string; branchId: string }
  | { kind: "org"; orgId: string }
  | { kind: "target"; orgId: string | null; branchId: string }
  | { kind: "platform" };

/**
 * Resolve the request's scope from the caller's claims. Throws
 * UNAUTHORIZED for an unauthenticated caller and FORBIDDEN when a
 * cashier names a branch other than their own — the request is refused,
 * never served the requested rows.
 */
export function resolveBranchFilter(caller: Caller | null, requestedBranchId?: string): BranchScopeDecision {
  if (caller === null) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const { claims } = caller;

  if (claims.role === "cashier") {
    if (requestedBranchId === undefined || requestedBranchId === claims.branch_id) {
      return { kind: "branch", orgId: claims.org_id as string, branchId: claims.branch_id as string };
    }
    throw new TRPCError({ code: "FORBIDDEN", message: "scope comes from the session claims, not the request" });
  }

  if (claims.role === "org_admin") {
    if (requestedBranchId === undefined) {
      return { kind: "org", orgId: claims.org_id as string };
    }
    return { kind: "target", orgId: claims.org_id, branchId: requestedBranchId };
  }

  // platform_admin: reaches all organizations by design, through
  // server-side paths; a named branch is verified for visibility.
  if (requestedBranchId === undefined) {
    return { kind: "platform" };
  }
  return { kind: "target", orgId: null, branchId: requestedBranchId };
}

/**
 * Verify a target decision against the caller's scope. The branch lookup
 * itself runs claim-scoped (RLS-governed), so an invisible branch resolves
 * to null and is refused with NOT_FOUND. A branch that resolves must also
 * belong to the caller's claim organization.
 */
export function assertTargetInScope(
  decision: BranchScopeDecision,
  branch: { orgId: string } | null,
): string {
  if (decision.kind !== "target") {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "no target to verify" });
  }
  if (branch === null) {
    throw new TRPCError({ code: "NOT_FOUND", message: "branch not found in the caller's scope" });
  }
  if (decision.orgId !== null && branch.orgId !== decision.orgId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "branch belongs to another organization" });
  }
  return decision.branchId;
}
