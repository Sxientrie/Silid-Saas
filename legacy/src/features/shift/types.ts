import type { ShiftStatus } from '@/constants/shift.constants'

export interface Shift {
  id: string
  branch_id: string
  opened_by: string
  closed_by: string | null
  opened_at: string
  closed_at: string | null
  expected_room: number
  expected_canteen: number
  expected_addons: number
  expected_total: number
  counted_total: number | null
  variance: number | null
  status: ShiftStatus
}

/** A shift row joined with display names for the admin history view. */
export interface ShiftWithNames extends Shift {
  branches: { name: string } | null
  opener: { email: string } | null
  closer: { email: string } | null
}

/**
 * Live, display-only summary of the money collected since the open shift
 * started. Authoritative figures are computed server-side at close time by
 * the `close_shift` RPC — these client sums are for the dashboard only.
 */
export interface ShiftSummary {
  branch_id: string
  shift_id: string | null
  window_start: string
  room_revenue: number
  canteen_revenue: number
  addon_revenue: number
  total_revenue: number
  sessions_count: number
  canteen_sales_count: number
}
