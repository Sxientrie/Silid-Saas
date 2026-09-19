import type { BookingType } from '@/constants/booking.constants'

import type { SessionStatus } from '@/constants/room.constants'

export interface Session {
  id: string
  branch_id: string
  room_id: string
  cashier_id: string
  booking_type: BookingType
  pax: number
  base_rate: number
  surcharges: number
  checked_in_at: string
  booked_end_at: string
  checked_out_at: string | null
  total: number
  status: SessionStatus
  void_reason: string | null
}

export interface CreateSessionPayload {
  room_id: string
  booking_type: BookingType
  pax: number
}
