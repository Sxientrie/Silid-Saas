import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function SystemClock({ isOnline }: { isOnline: boolean }) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const formattedTime = time.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const formattedDate = time.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="flex h-8 items-center gap-2.5 rounded-md border border-border bg-input px-3 shadow-sm">
      <span className="text-xs font-medium text-muted-foreground">{formattedDate}</span>
      <div className="h-3.5 w-[1.5px] rounded-full bg-border" />
      <span className="text-[length:var(--font-size-header-accent)] font-bold tracking-tight text-primary">{formattedTime}</span>
      <div className="h-3.5 w-[1.5px] rounded-full bg-border" />
      <div
        className={cn(
          'h-2.5 w-2.5 rounded-[4px] shadow-inner ring-1 ring-black/5 dark:ring-white/10',
          isOnline ? 'bg-status-online' : 'bg-destructive'
        )}
        title={isOnline ? 'Online' : 'Offline'}
      />
    </div>
  )
}
