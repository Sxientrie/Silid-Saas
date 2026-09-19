// ---------- API Response Wrappers ----------

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

// ---------- Pagination ----------

export interface PaginationParams {
  page: number
  pageSize: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// ---------- Sync ----------

export type SyncStatus = 'idle' | 'syncing' | 'error'

export interface SyncQueueItem {
  id: string
  table: string
  payload: Record<string, unknown>
  client_timestamp: string
  synced: boolean
}
