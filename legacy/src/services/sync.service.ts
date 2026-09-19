import { db } from '@/lib/dexie'
import { supabase } from '@/lib/supabase'
import { useSyncStore } from '@/store/sync.store'

/**
 * Drains the offline queue in chronological order.
 * Each entry is replayed to Supabase via upsert keyed on `id`.
 * Duplicate detection prevents double entries from network hiccups.
 */
export async function drainOfflineQueue() {
  const store = useSyncStore.getState()

  const pending = await db.offline_queue
    .where('synced')
    .equals(0)
    .sortBy('client_timestamp')

  if (pending.length === 0) {
    store.setSyncStatus('idle')
    return
  }

  store.setSyncStatus('syncing')

  for (const entry of pending) {
    try {
      const { error } = await supabase
        .from(entry.table)
        .upsert(entry.payload as Record<string, unknown>, {
          onConflict: 'id',
        })

      if (error) {
        console.error(`[sync-worker] Failed to sync ${entry.id}:`, error)
        store.setSyncStatus('error')
        continue // Allow other items to try syncing
      }

      await db.offline_queue.update(entry.id, { synced: 1 })
    } catch (err) {
      console.error('[sync-worker] Unexpected error:', err)
      store.setSyncStatus('error')
      continue
    }
  }

  // Update store once after all attempts
  const remaining = await db.offline_queue.where('synced').equals(0).count()
  store.setQueueLength(remaining)
  store.setLastSyncedAt(new Date())
  
  if (remaining === 0) {
    store.setSyncStatus('idle')
  }
}

/**
 * Enqueue a write for later sync.
 * Used when the app is offline and cannot reach Supabase directly.
 */
export async function enqueueOfflineWrite(
  table: string,
  payload: Record<string, unknown>
) {
  const id = crypto.randomUUID()
  await db.offline_queue.add({
    id,
    table,
    payload: { ...payload, id: payload.id ?? id },
    client_timestamp: new Date().toISOString(),
    synced: 0,
  })

  const store = useSyncStore.getState()
  store.setQueueLength(
    await db.offline_queue.where('synced').equals(0).count()
  )
}

export async function getOfflineQueueLength(): Promise<number> {
  return await db.offline_queue.where('synced').equals(0).count()
}
