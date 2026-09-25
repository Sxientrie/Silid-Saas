export const SILID_PACKAGE_NAME = "@silid/api" as const;

export { appRouter } from "./app.router";
export type { AppRouter } from "./app.router";

export { trpc, protectedProcedure, orgAdminProcedure } from "./trpc";
export type { TrpcContextShape } from "./trpc";

export { createTrpcContext } from "./context";
export type { Caller, CreateTrpcContextOptions, TrpcContext } from "./context";

export {
  createSilidDataClient,
  toBranchView,
  toRateConfig,
  toRoomView,
  toSessionView,
  toStaffView,
} from "./data-client";
export type { SilidDataClient } from "./data-client";

export { resolveBranchFilter, assertTargetInScope } from "./scope";
export type { BranchScopeDecision } from "./scope";

export {
  defaultAddonCatalogue,
  defaultCanteenCatalogue,
} from "./catalogue";
export type { AddonCatalogueItem, CanteenCatalogueItem } from "./catalogue";

import { trpc } from "./trpc";
import { appRouter } from "./app.router";
import type { Caller } from "./context";
import type { SilidDataClient } from "./data-client";

/** Create a typed caller over the app router for a concrete context. */
export const createSilidCallerFactory = trpc.createCallerFactory;

/**
 * Test/wiring helper: a caller bound to an explicitly provided caller and
 * data port. The deterministic router tests drive scope resolution through
 * it; the live contract tests pass the real as-caller data client.
 */
export function createTestCaller(
  caller: Caller | null,
  data: SilidDataClient,
): ReturnType<ReturnType<typeof createSilidCallerFactory>> {
  return createSilidCallerFactory(appRouter)({ caller, data });
}
