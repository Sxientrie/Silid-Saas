import { createHarnessDouble } from "./double";

/**
 * HARNESS-ONLY. One ledger for the whole process, so the accept log the desk
 * reads back is the log the write route appended to. A module-level instance
 * is the right shape here precisely because nothing is durable: the proof is
 * "these replays arrived in this order on this server", not "this survived a
 * restart".
 */
export const harnessDouble = createHarnessDouble();

/** HARNESS-ONLY. The read fixture the desk mirrors into Dexie.
 *
 * Rooms only. Rate configuration and catalogue prices are money, and Phase 05
 * has no server-side source for them: inventing peso figures to fill a cache
 * would put a fabricated amount in front of a cashier and would trip the Money
 * Recomputation Gate (`spec/domain-rules.md` §7) for no proof. The Dexie
 * schema carries the tables for both (`packages/offline-sync/src/db.ts`);
 * populating them is a later phase's work, with real money behind it.
 */
export const HARNESS_ROOMS = [
  { id: "room-101", roomNumber: "101", status: "vacant" },
  { id: "room-102", roomNumber: "102", status: "occupied" },
  { id: "room-103", roomNumber: "103", status: "cleaning" },
] as const;
