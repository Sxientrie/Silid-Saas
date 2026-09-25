/**
 * Branches domain router. listBranches takes NO tenant identifier: the
 * caller's scope comes from the verified claims and Row-Level Security —
 * a cashier sees their branch, an org admin their organization's branches,
 * the platform tier all (spec/multi-tenancy.md §2). Any supplied org/branch
 * identifier is refused by the input schema, never honored.
 */
import { z } from "zod";
import { protectedProcedure, trpc } from "../trpc";

export const branchesRouter = trpc.router({
  listBranches: protectedProcedure.input(z.void()).query(async ({ ctx }) => {
    return ctx.data.listBranches();
  }),
});
