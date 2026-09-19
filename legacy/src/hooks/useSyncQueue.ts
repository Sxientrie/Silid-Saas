import { useEffect, useCallback } from 'react'
import { drainOfflineQueue, getOfflineQueueLength } from '@/services/sync.service'
import { useOnlineStatus } from './useOnlineStatus'
import { useSyncStore } from '@/store/sync.store'

export function useSyncQueue() {
  const isOnline = useOnlineStatus()
  const { setQueueLength } = useSyncStore()

  const drainQueue = useCallback(async () => {
    await drainOfflineQueue()
  }, [])

  // Drain queue when coming back online
  useEffect(() => {
    if (isOnline) {
      drainQueue()
    }
  }, [isOnline, drainQueue])

  // Update queue length on mount
  useEffect(() => {
    getOfflineQueueLength().then(setQueueLength)
  }, [setQueueLength])

  return { drainQueue }
}
