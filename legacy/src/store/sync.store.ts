import { create } from 'zustand'
import type { SyncStatus } from '@/types/common.types'

interface SyncState {
  isOnline: boolean
  syncStatus: SyncStatus
  queueLength: number
  lastSyncedAt: Date | null
  setOnline: (online: boolean) => void
  setSyncStatus: (status: SyncStatus) => void
  setQueueLength: (length: number) => void
  setLastSyncedAt: (date: Date) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncStatus: 'idle',
  queueLength: 0,
  lastSyncedAt: null,

  setOnline: (isOnline) => set({ isOnline }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setQueueLength: (queueLength) => set({ queueLength }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}))
