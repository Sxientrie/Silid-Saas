import { z } from "zod";

/**
 * HARNESS-ONLY. The read surface the desk mirrors into Dexie.
 *
 * One schema, parsed on both sides, for the same reason the write envelope has
 * one: a test double whose two halves disagree is a test double that passes
 * for the wrong reason. Rooms only — rate configuration and catalogue prices
 * are money, and Phase 05 has no server-side source for either, so the cache
 * tables for them (`packages/offline-sync/src/db.ts`) stay empty until a real
 * money feature fills them.
 */
export const harnessRoomStatusSchema = z.enum(["vacant", "occupied", "cleaning"]);

export const harnessReadSchema = z.strictObject({
  /** Sealed by the server at read time; a cached copy is visibly older. */
  servedAt: z.string().min(1),
  /**
   * How many writes *this run's* ledger has taken, so "the caches were
   * refreshed after the drain" is an observable fact and not an inference.
   * Scoped, not global: the double is a server-memory singleton shared by every
   * test in the run, and a global count would make one test's assertion depend
   * on how many writes an earlier test happened to make.
   */
  acceptedCount: z.number().int().nonnegative(),
  rooms: z.array(
    z.strictObject({
      id: z.string().min(1),
      roomNumber: z.string().min(1),
      status: harnessRoomStatusSchema,
    }),
  ),
});

export type HarnessRead = z.output<typeof harnessReadSchema>;
