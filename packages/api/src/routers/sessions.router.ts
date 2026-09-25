/**
 * Sessions domain router. Read-only: sessions are created and transitioned
 * by the named server transitions (check-in, checkout RPC, void path —
 * spec/data-model.md §2), so the desk consumes claim-scoped reads here.
 */
import { z } from "zod";
import { protectedProcedure, trpc } from "../trpc";
import { resolveBranchFilter } from "../scope";
import { resolveBranchIds } from "../branch-scope";

const branchSelectorInput = z.strictObject({ branchId: z.uuid().optional() });

export const sessionsRouter = trpc.router({
  listSessions: protectedProcedure.input(branchSelectorInput).query(async ({ ctx, input }) => {
    const decision = resolveBranchFilter(ctx.caller, input.branchId);
    return ctx.data.listSessions(await resolveBranchIds(ctx.caller, ctx.data, decision));
  }),
});
