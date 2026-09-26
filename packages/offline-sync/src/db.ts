import Dexie, { type Table } from "dexie";

/**
 * The local layer (spec/offline-sync.md §1). Dexie over IndexedDB owns three
 * concerns for one desk machine: the read cache, the outbox, and the session
 * mirror. Nothing here talks to the network — the point of the layer is that a
 * desk keeps rendering, pricing, and queueing when the branch has no link.
 *
 * The database name is per desk machine by construction: a browser origin
 * gets its own IndexedDB namespace, so two desks on two machines never share
 * a local layer, and the name below is only a label inside that origin.
 */
export const DEFAULT_DB_NAME = "silid-frontdesk";

/** Room status as the desk renders it; the server copy wins on refresh. */
export type CachedRoomStatus = "vacant" | "occupied" | "cleaning" | "out_of_service";

export interface CachedRoom {
  id: string;
  branchId: string;
  roomNumber: string;
  status: CachedRoomStatus;
  cachedAt: string;
}

/**
 * The branch's rate configuration exactly as the server returned it. It is
 * kept opaque on purpose: the desk never computes a rate from its own copy,
 * it renders what the server last said and recomputes on the next replay
 * (`spec/domain-rules.md` §7).
 */
export interface CachedRateConfig {
  branchId: string;
  rateConfig: unknown;
  cachedAt: string;
}

export interface CachedCatalogueItem {
  id: string;
  branchId: string;
  name: string;
  /** Money is a string decimal; the desk never re-derives it. */
  price: string;
  cachedAt: string;
}

/**
 * An active session mirrored locally so the overstay ladder keeps computing
 * offline. Display math is pure and local by design
 * (`spec/domain-rules.md` §3); the timestamps here are the server's sealed
 * values from the last sync.
 */
export interface SessionMirrorRow {
  id: string;
  branchId: string;
  roomId: string;
  checkedInAt: string;
  bookedEndAt: string;
  status: "occupied" | "closed";
}

export type OutboxState = "pending" | "inflight" | "errored";

/**
 * One queued write. The row carries the action's *inputs* only — never an
 * amount, never a server-owned timestamp (spec/offline-sync.md §2.3, §2.5).
 */
export interface OutboxEntry {
  id?: number;
  /** Client-generated; the server coalesces replays on it. */
  idempotencyKey: string;
  procedure: string;
  payload: unknown;
  /**
   * The client's local enqueue instant. Metadata, never authoritative: the
   * server re-seals time at accept (Invariant 2a), which is why this is the
   * only timestamp on the row.
   */
  enqueuedAt: string;
  /** Selects the online-only gate's shift-open/close block. */
  moneyAffecting: boolean;
  state: OutboxState;
  attempts: number;
  /** Why a poisoned entry stopped, surfaced to the desk. */
  lastError?: string;
}

export class SilidOfflineDb extends Dexie {
  rooms!: Table<CachedRoom, string>;
  rateConfigs!: Table<CachedRateConfig, string>;
  catalogue!: Table<CachedCatalogueItem, string>;
  outbox!: Table<OutboxEntry, number>;
  sessionMirror!: Table<SessionMirrorRow, string>;

  constructor(name: string = DEFAULT_DB_NAME) {
    super(name);
    this.version(1).stores({
      // roomNumber is indexed because it is the desk's own ordering: a room
      // list that came back in uuid order would be unreadable on the floor.
      // The index sorts key paths, so "10" precedes "2" — a branch that needs
      // numeric room order has to zero-pad its numbers, and the desk that owns
      // that decision owns the numbering.
      rooms: "id, branchId, status, roomNumber",
      rateConfigs: "branchId",
      catalogue: "id, branchId",
      // ++id is the auto-increment primary key, so insertion order *is*
      // replay order with no extra bookkeeping. &idempotencyKey is unique:
      // a replayed enqueue of the same action collapses onto the same row
      // instead of queueing a second drain of it.
      outbox: "++id, &idempotencyKey, state",
      sessionMirror: "id, branchId, roomId, status",
    });
  }
}
