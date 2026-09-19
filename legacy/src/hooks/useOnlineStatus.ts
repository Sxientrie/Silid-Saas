import { useEffect, useSyncExternalStore } from 'react'
import { useSyncStore } from '@/store/sync.store'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot() {
  return navigator.onLine
}

function getServerSnapshot() {
  return true
}

export function useOnlineStatus(): boolean {
  const setOnline = useSyncStore((s) => s.setOnline)

  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    setOnline(isOnline)
  }, [isOnline, setOnline])

  return isOnline
}
