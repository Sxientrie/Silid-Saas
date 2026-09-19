import { WifiOff } from 'lucide-react'

type OfflineBannerProps = {
  isOnline: boolean
  queueLength: number
}

export function OfflineBanner({ isOnline, queueLength }: OfflineBannerProps) {

  if (isOnline) return null

  return (
    <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-2 rounded-md">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
        Offline — {queueLength} {queueLength === 1 ? 'entry' : 'entries'} queued
        for sync
      </span>
    </div>
  )
}
