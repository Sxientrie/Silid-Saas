import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type CountdownTimerProps = {
  targetDate: Date
  onExpire?: () => void
  className?: string
}

export function CountdownTimer({ targetDate, onExpire, className }: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(
    () => Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000))
  )

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpire?.()
      return
    }

    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          onExpire?.()
          clearInterval(interval)
          return 0
        }
        return s - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [targetDate, onExpire, secondsLeft])

  const minutes = Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, '0')
  const seconds = (secondsLeft % 60).toString().padStart(2, '0')

  const isUrgent = secondsLeft <= 300 // last 5 minutes

  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        isUrgent && 'text-destructive font-semibold',
        className
      )}
    >
      {minutes}:{seconds}
    </span>
  )
}
