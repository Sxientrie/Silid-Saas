/**
 * The root application router. Domains: branches, rooms, staff, sessions,
 * rates (the rate-configuration service), catalogue. Every procedure
 * resolves scope from the verified session claims (Layer 1,
 * spec/multi-tenancy.md §3); tenant identifiers are never authoritative
 * inputs.
 */
import { trpc } from "./trpc";
import { branchesRouter } from "./routers/branches.router";
import { catalogueRouter } from "./routers/catalogue.router";
import { ratesRouter } from "./routers/rates.router";
import { roomsRouter } from "./routers/rooms.router";
import { sessionsRouter } from "./routers/sessions.router";
import { staffRouter } from "./routers/staff.router";

export const appRouter = trpc.router({
  branches: branchesRouter,
  catalogue: catalogueRouter,
  rates: ratesRouter,
  rooms: roomsRouter,
  sessions: sessionsRouter,
  staff: staffRouter,
});

export type AppRouter = typeof appRouter;
