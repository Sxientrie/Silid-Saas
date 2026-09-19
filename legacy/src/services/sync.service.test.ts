import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drainOfflineQueue } from './sync.service'
import { db } from '@/lib/dexie'
import { supabase } from '@/lib/supabase'
import { useSyncStore } from '@/store/sync.store'

// Mock dependencies
vi.mock('@/lib/dexie', () => ({
  db: {
    offline_queue: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      sortBy: vi.fn().mockResolvedValue([
        { id: '1', table: 'rooms', payload: { name: 'Room 1' }, synced: 0 }
      ]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue(1),
    }
  }
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null })
  }
}))

describe('sync.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should drain the offline queue and update store status', async () => {
    const store = useSyncStore.getState()
    const setSyncStatusSpy = vi.spyOn(store, 'setSyncStatus')
    const setQueueLengthSpy = vi.spyOn(store, 'setQueueLength')

    await drainOfflineQueue()

    expect(setSyncStatusSpy).toHaveBeenCalledWith('syncing')
    expect(supabase.from).toHaveBeenCalledWith('rooms')
    expect(db.offline_queue.update).toHaveBeenCalledWith('1', { synced: 1 })
    expect(setQueueLengthSpy).toHaveBeenCalledWith(0)
    expect(setSyncStatusSpy).toHaveBeenCalledWith('idle')
  })

  it('should continue on error and update status to error', async () => {
    vi.mocked(supabase.upsert).mockResolvedValueOnce({ error: { message: 'Failed' } as any })
    
    const store = useSyncStore.getState()
    const setSyncStatusSpy = vi.spyOn(store, 'setSyncStatus')

    await drainOfflineQueue()

    expect(setSyncStatusSpy).toHaveBeenCalledWith('error')
    // Should still finish the loop and potentially set back to idle if no items left (but remaining is 0 in our mock)
    expect(setSyncStatusSpy).toHaveBeenCalledWith('idle')
  })
})
