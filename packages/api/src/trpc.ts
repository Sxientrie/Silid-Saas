/**
 * The tRPC core: procedures resolve scope from the verified session claims
 * only (Layer 1, spec/multi-tenancy.md §3). Procedure names are verbNoun
 * (spec/monorepo-structure.md §3); routers live in <domain>.router.ts.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import type { Caller } from "./context";
import type { SilidDataClient } from "./data-client";

export interface TrpcContextShape {
  caller: Caller | null;
  data: SilidDataClient | null;
}

export const trpc = initTRPC.context<TrpcContextShape>().create();

/** Requires a verified session and the as-caller data client. */
const enforced = trpc.middleware(({ ctx, next }) => {
  if (ctx.caller === null || ctx.data === null) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { caller: ctx.caller, data: ctx.data } });
});

export const protectedProcedure = trpc.procedure.use(enforced);

/** Organization-tier surfaces (rate configuration, org management reads). */
const orgAdminOnly = trpc.middleware(({ ctx, next }) => {
  if (ctx.caller === null || ctx.data === null) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (ctx.caller.claims.role !== "org_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "this surface belongs to the organization tier" });
  }
  return next({ ctx: { caller: ctx.caller, data: ctx.data } });
});

export const orgAdminProcedure = protectedProcedure.use(orgAdminOnly);
