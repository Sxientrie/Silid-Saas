/**
 * Branch domain schemas (spec/data-model.md §1). Read views only — branch
 * master data is written by provisioning/platform paths, not by the desk.
 */
import { z } from "zod";
import { rateConfigSchema } from "./rate-config.schema.ts";

export const branchViewSchema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  name: z.string(),
  createdAt: z.string(),
});
export type BranchView = z.output<typeof branchViewSchema>;

/** The branch view the rate-configuration surfaces read: identity + card. */
export const branchWithRateConfigSchema = branchViewSchema.extend({
  rateConfig: rateConfigSchema.nullish().transform((value) => value ?? undefined),
});
export type BranchWithRateConfig = z.output<typeof branchWithRateConfigSchema>;
