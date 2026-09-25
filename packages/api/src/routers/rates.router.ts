/**
 * Rates domain router — the rate-configuration service
 * (roadmap 04 Deliverable 4; vault-07, vault-20).
 *
 * Reads return the branch's stored card; writes go through the merge path
 * (the Phase 02 SQL function, wrapped by public.update_rate_config so the
 * merge, the persisted write, and the audit row are one transaction),
 * preserving configuration keys the save does not touch (vault-20). Input
 * validation is the §3.3 editor block (packages/schemas): the service
 * refuses, with a clear error, every value the database would silently
 * fall back from. The branch id is a target selector verified against the
 * caller's claim scope; scope itself never comes from the client.
 */
import { z } from "zod";
import { updateRateConfigInputSchema } from "@silid/schemas";
import { orgAdminProcedure, trpc } from "../trpc";
import { assertTargetInScope, resolveBranchFilter } from "../scope";
import { toRateConfig, type SilidDataClient } from "../data-client";
import type { Caller } from "../context";

const rateConfigTargetInput = z.strictObject({ branchId: z.uuid() });

async function verifiedBranchId(
  caller: Caller,
  branchId: string,
  data: Pick<SilidDataClient, "getBranch">,
): Promise<string> {
  const decision = resolveBranchFilter(caller, branchId);
  return assertTargetInScope(decision, await data.getBranch(branchId));
}

export const ratesRouter = trpc.router({
  /** Read the branch's stored rate card (unknown keys preserved, vault-20). */
  getRateConfig: orgAdminProcedure.input(rateConfigTargetInput).query(async ({ ctx, input }) => {
    const branchId = await verifiedBranchId(ctx.caller, input.branchId, ctx.data);
    return ctx.data.getBranch(branchId);
  }),

  /**
   * Merge rate-configuration overrides into the branch's card. The audit
   * row is written by the database function in the SAME transaction
   * (spec/data-model.md §2), with actor and time sealed from the caller's
   * verified claims — no client input participates.
   */
  updateRateConfig: orgAdminProcedure.input(updateRateConfigInputSchema).mutation(async ({ ctx, input }) => {
    const branchId = await verifiedBranchId(ctx.caller, input.branchId, ctx.data);
    return toRateConfig(
      await ctx.data.updateRateConfig(branchId, input.canteenOverrides, input.extensionOverrides),
    );
  }),
});
