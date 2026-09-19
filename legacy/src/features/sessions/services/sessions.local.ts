import { db } from '@/lib/dexie'
import type { Session } from '../types'

export async function cacheSession(session: Session) {
  await db.sessions_cache.put({
    id: session.id,
    branch_id: session.branch_id,
    room_id: session.room_id,
    cashier_id: session.cashier_id,
    booking_type: session.booking_type,
    pax: session.pax,
    base_rate: session.base_rate,
    surcharges: session.surcharges,
    checked_in_at: session.checked_in_at,
    booked_end_at: session.booked_end_at,
    checked_out_at: session.checked_out_at,
    total: session.total,
    status: session.status,
  })
}

export async function getCachedActiveSessions(branchId: string) {
  return db.sessions_cache
    .where('branch_id')
    .equals(branchId)
    .and((s) => s.status === 'active')
    .toArray()
}

export async function removeCachedSession(sessionId: string) {
  await db.sessions_cache.delete(sessionId)
}
