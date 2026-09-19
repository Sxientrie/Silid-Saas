import { cn } from '@/lib/utils'
import { ROOM_STATUS, type RoomStatus } from '@/constants/room.constants'

type StatusDotProps = {
  status: RoomStatus | 'online' | 'offline'
  className?: string
}

const STATUS_COLORS: Record<string, string> = {
  [ROOM_STATUS.VACANT]: 'bg-status-vacant',
  [ROOM_STATUS.OCCUPIED]: 'bg-primary',
  [ROOM_STATUS.GRACE]: 'bg-status-grace animate-pulse',
  online: 'bg-status-online',
  offline: 'bg-destructive',
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        STATUS_COLORS[status] ?? 'bg-muted-foreground',
        className
      )}
    />
  )
}
