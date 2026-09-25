/**
 * Rooms domain router. Reads are claim-scoped: a cashier is served their
 * claim branch, an org admin their organization (optionally narrowed to
 * one verified branch), the platform tier everything. Room status is never
 * writable from clients (spec/domain-rules.md §4).
 */
import { z } from "zod";
import { protectedProcedure, trpc } from "../trpc";
import { resolveBranchFilter } from "../scope";
import { resolveBranchIds } from "../branch-scope";

const branchSelectorInput = z.strictObject({ branchId: z.uuid().optional() });

export const roomsRouter = trpc.router({
  listRooms: protectedProcedure.input(branchSelectorInput).query(async ({ ctx, input }) => {
    const decision = resolveBranchFilter(ctx.caller, input.branchId);
    return ctx.data.listRooms(await resolveBranchIds(ctx.caller, ctx.data, decision));
  }),
});
