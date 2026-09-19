import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ROOM_STATUS } from '@/constants/room.constants'
import { useAuthStore } from '@/store/auth.store'
import { useRateConfig } from '@/features/rates/hooks/useRateConfig'
import { useRooms } from '@/features/rooms/hooks/useRooms'
import { useActiveSessions } from '../hooks/useActiveSessions'
import { computeOverstay, extensionParamsFromConfig } from '../utils/overstay'
import type { Session } from '../types'

const TICK_MS = 10_000

/**
 * Desk alert for overstays (suggestions/02). Every active session is placed
 * on the overstay ladder from its own timestamps — no cron, no edge function,
 * no room-status dependency. Overdue sessions float to the top so the desk
 * sees the rooms that are accruing extension charges first.
 */
export function ActiveSessionsPanel() {
  const user = useAuthStore((s) => s.user)
  const branchId = user?.branch_id ?? ''

  const { data: sessions = [], isLoading } = useActiveSessions()
  const { data: rooms = [] } = useRooms()
  const { data: rateConfig } = useRateConfig(branchId || null)

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const params = useMemo(
    () => extensionParamsFromConfig(rateConfig?.rate_config),
    [rateConfig]
  )

  const roomNumberById = useMemo(() => {
    const map = new Map<string, string>()
    rooms.forEach((room) => map.set(room.id, room.room_number))
    return map
  }, [rooms])

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => a.booked_end_at.localeCompare(b.booked_end_at)),
    [sessions]
  )

  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    rooms.forEach((room) => {
      counts[room.status] = (counts[room.status] ?? 0) + 1
    })
    return counts
  }, [rooms])

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {rooms.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Rooms:</span>
          <StatusChip label="Vacant" count={roomCounts[ROOM_STATUS.VACANT] ?? 0} />
          <StatusChip label="Occupied" count={roomCounts[ROOM_STATUS.OCCUPIED] ?? 0} />
          <StatusChip label="In grace" count={roomCounts[ROOM_STATUS.GRACE] ?? 0} />
          <StatusChip label="Overdue" count={roomCounts[ROOM_STATUS.OVERDUE] ?? 0} />
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        {sorted.length === 0 ? (
          <EmptyState
            title="No active sessions"
            description="Guests currently checked in appear here. Overstaying rooms rise to the top."
          />
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                roomNumber={roomNumberById.get(session.room_id) ?? '—'}
                nowMs={nowMs}
                params={params}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function SessionRow({
  session,
  roomNumber,
  nowMs,
  params,
}: {
  session: Session
  roomNumber: string
  nowMs: number
  params: ReturnType<typeof extensionParamsFromConfig>
}) {
  const overstay = computeOverstay(session.booked_end_at, nowMs, params)

  return (
    <li className="flex items-center gap-4 p-4">
      <div className="w-20 shrink-0">
        <p className="text-sm font-semibold text-foreground">Room {roomNumber}</p>
        <p className="text-xs text-muted-foreground">
          {session.booking_type === 'SHORT_TIME' ? 'Short time' : 'Overnight'} · {session.pax} pax
        </p>
      </div>

      <div className="flex-1 text-xs text-muted-foreground">
        <p>Checked in {formatTime(session.checked_in_at)}</p>
        <p>Booked end {formatTime(session.booked_end_at)}</p>
      </div>

      <OverstayBadge overstay={overstay} />
    </li>
  )
}

function OverstayBadge({ overstay }: { overstay: ReturnType<typeof computeOverstay> }) {
  if (overstay.phase === 'booked') {
    return <Badge variant="secondary">On time</Badge>
  }
  if (overstay.phase === 'grace') {
    return <Badge variant="outline">Grace · {overstay.graceMinutesLeft}m left</Badge>
  }
  return (
    <Badge variant="destructive">
      Overdue · ₱{overstay.accruingAmount.toLocaleString('fil-PH')} accruing
      {overstay.blocksAccrued > 0 ? ` (${overstay.blocksAccrued} block${overstay.blocksAccrued === 1 ? '' : 's'})` : ''}
    </Badge>
  )
}

function StatusChip({ label, count }: { label: string; count: number }) {
  return (
    <span>
      {label} <strong className="text-foreground">{count}</strong>
    </span>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fil-PH', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
