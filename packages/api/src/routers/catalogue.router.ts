/**
 * Catalogue domain router: serves the add-on and canteen catalogue default
 * prices straight from the money reference fixture, so every client reads
 * prices instead of hard-coding them (spec/domain-rules.md §5–§7). Per-
 * branch overrides are applied by the database at posting time, never by
 * clients.
 */
import { z } from "zod";
import { protectedProcedure, trpc } from "../trpc";
import { defaultAddonCatalogue, defaultCanteenCatalogue } from "../catalogue";

export const catalogueRouter = trpc.router({
  getDefaultCatalogue: protectedProcedure.input(z.void()).query(() => {
    return {
      addons: defaultAddonCatalogue(),
      canteen: defaultCanteenCatalogue(),
      currency: "PHP" as const,
    };
  }),
});
