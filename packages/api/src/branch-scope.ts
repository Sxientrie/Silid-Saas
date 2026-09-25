/**
 * Shared procedure plumbing: turn a claim-derived scope decision into the
 * concrete branch-id filter handed to the data port. The data layer only
 * ever sees claim-scoped branch ids — a client-named branch arrives here
 * only after assertTargetInScope verified it inside the caller's scope.
 */
import { assertTargetInScope, type BranchScopeDecision } from "./scope";
import type { Caller } from "./context";
import type { SilidDataClient } from "./data-client";

export async function resolveBranchIds(
  caller: Caller,
  data: SilidDataClient,
  decision: BranchScopeDecision,
): Promise<string[]> {
  switch (decision.kind) {
    case "branch":
      return [decision.branchId];
    case "target":
      // The lookup runs claim-scoped (RLS-governed); an invisible branch
      // resolves to null and is refused. A resolved branch must still
      // belong to the caller's claim organization.
      return [assertTargetInScope(decision, await data.getBranch(decision.branchId))];
    case "org":
      // Defense in depth: filter the RLS-scoped set to the claim org.
      return (await data.listBranches())
        .filter((branch) => branch.orgId === caller.claims.org_id)
        .map((branch) => branch.id);
    case "platform":
      // The platform tier reaches all organizations by design
      // (spec/multi-tenancy.md §2); its reads are audited and RLS-scoped.
      return (await data.listBranches()).map((branch) => branch.id);
  }
}
