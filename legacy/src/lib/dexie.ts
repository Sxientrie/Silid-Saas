import Dexie, { type EntityTable } from 'dexie'

// ---------- Table Interfaces ----------

export interface OfflineQueueEntry {
  id: string
  table: string
  payload: Record<string, unknown>
  client_timestamp: string
  synced: number
}

export interface SessionCacheEntry {
  id: string
  branch_id: string
  room_id: string
  cashier_id: string
  booking_type: string
  pax: number
  base_rate: number
  surcharges: number
  checked_in_at: string
  booked_end_at: string
  checked_out_at: string | null
  total: number
  status: string
}

export interface RateCacheEntry {
  id: string
  branch_id: string
  rate_config: Record<string, unknown>
}

export interface GraceTimerEntry {
  session_id: string
  booked_end_at: string
  grace_end_at: string
  charged: boolean
}

// ---------- Database ----------

class MotelTrackDB extends Dexie {
  offline_queue!: EntityTable<OfflineQueueEntry, 'id'>
  sessions_cache!: EntityTable<SessionCacheEntry, 'id'>
  rates_cache!: EntityTable<RateCacheEntry, 'id'>
  grace_timers!: EntityTable<GraceTimerEntry, 'session_id'>

  constructor() {
    super('MotelTrackDB')

    this.version(1).stores({
      offline_queue: 'id, table, synced',
      sessions_cache: 'id, branch_id, status',
      rates_cache: 'id, branch_id',
      grace_timers: 'session_id',
    })
  }
}

export const db = new MotelTrackDB()
