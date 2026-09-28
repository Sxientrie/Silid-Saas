/**
 * Sessions domain router. Reads are claim-scoped; the two state transitions
 * ride the named server transitions (spec/data-model.md §2): check-in is an
 * as-caller insert sealed by the database trigger, check-out is the
 * `close_session` sealing RPC — both leave scope, time, and money entirely
 * to the server (spec/domain-rules.md §2–§3, Invariants 2a/2c). The void
 * path is not exposed here: it is an organization-tier surface
 * (spec/domain-rules.md §9) and lands with the admin surfaces.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { checkInInputSchema } from "@silid/schemas";
import { protectedProcedure, trpc } from "../trpc";
import { resolveBranchFilter } from "../scope";
import { resolveBranchIds } from "../branch-scope";

const branchSelectorInput = z.strictObject({ branchId: z.uuid().optional() });
const sessionSelectorInput = z.strictObject({ sessionId: z.uuid() });

/** The client's room is a preference; the database validates vacancy and branch scope. */
const createSessionInput = checkInInputSchema;

export const sessionsRouter = trpc.router({
  listSessions: protectedProcedure.input(branchSelectorInput).query(async ({ ctx, input }) => {
    const decision = resolveBranchFilter(ctx.caller, input.branchId);
    return ctx.data.listSessions(await resolveBranchIds(ctx.caller, ctx.data, decision));
  }),

  getSession: protectedProcedure.input(sessionSelectorInput).query(async ({ ctx, input }) => {
    // RLS scopes the read: a session outside the caller's branch resolves to
    // null and is surfaced as not found, never as someone else's row.
    return ctx.data.getSession(input.sessionId);
  }),

  /**
   * Check-in (vault-10). The caller supplies the room preference, the stay
   * type, and the guest count — nothing else (spec/applications.md §3): the
   * cashier identity comes from the verified token's sub, org/branch from
   * the claims, and the instants and money from the database. Payment
   * collection is a UI confirmation step ahead of this call (the house rule
   * is full payment, no partials, no refunds) and carries no server field.
   */
  createSession: protectedProcedure.input(createSessionInput).mutation(async ({ ctx, input }) => {
    if (ctx.caller.claims.role !== "cashier") {
      throw new TRPCError({ code: "FORBIDDEN", message: "check-in is a cashier surface" });
    }
    return ctx.data.checkInSession(ctx.caller.userId, input);
  }),

  /**
   * Check-out (vault-11): one server transaction seals base, surcharge,
   * posted add-ons, and the extension deficit, writes the audit row, and
   * releases the room. The desk sends the session id and nothing else.
   */
  closeSession: protectedProcedure.input(sessionSelectorInput).mutation(async ({ ctx, input }) => {
    return ctx.data.closeSession(input.sessionId);
  }),
});
