/**
 * Staff domain router. Staff reads are claim-scoped by the database's
 * select policy: a cashier sees their own row, an org admin their
 * organization's staff, the platform tier all. Provisioning and
 * deactivation are server-side trusted paths (spec/authentication.md §5),
 * never procedures here.
 */
import { z } from "zod";
import { protectedProcedure, trpc } from "../trpc";

export const staffRouter = trpc.router({
  listStaff: protectedProcedure.input(z.void()).query(async ({ ctx }) => {
    return ctx.data.listStaff();
  }),
});
