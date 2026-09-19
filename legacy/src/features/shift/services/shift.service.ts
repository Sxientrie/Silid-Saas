import { supabase } from '@/lib/supabase'
import { SHIFT_STATUS } from '@/constants/shift.constants'
import type { Shift, ShiftSummary, ShiftWithNames } from '../types'

/**
 * The currently open shift for a branch, or null. At most one open shift
 * per branch is enforced by a partial unique index in migration 0012.
 */
export async function fetchOpenShift(branchId: string): Promise<Shift | null> {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', SHIFT_STATUS.OPEN)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as Shift | null) ?? null
}

/** Opens a shift for the caller's branch via RPC. Cashier-only, server-sealed. */
export async function openShift(): Promise<Shift> {
  const { data, error } = await supabase.rpc('open_shift')

  if (error) throw error
  return data as unknown as Shift
}

/**
 * Ends the shift. The expected-cash breakdown is computed server-side by the
 * `close_shift` RPC and frozen; `countedTotal` is the physically counted
 * drawer amount (null = no count recorded yet). Online-only: closing while
 * offline writes are still queued would seal wrong totals, so callers must
 * block the action when `useOnlineStatus` reports offline.
 */
export async function closeShift(
  shiftId: string,
  countedTotal: number | null
): Promise<Shift> {
  const { data, error } = await supabase.rpc('close_shift', {
    p_shift_id: shiftId,
    p_counted_total: countedTotal,
  })

  if (error) throw error
  return data as unknown as Shift
}

/** Records a missed physical count on a closed shift (admin or shift owner). */
export async function recordShiftCount(
  shiftId: string,
  countedTotal: number
): Promise<Shift> {
  const { data, error } = await supabase.rpc('record_shift_count', {
    p_shift_id: shiftId,
    p_counted_total: countedTotal,
  })

  if (error) throw error
  return data as unknown as Shift
}

/** Closed-shift history for the admin reconciliation view (all branches). */
export async function fetchShiftHistory(): Promise<ShiftWithNames[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select(
      `*,
       branches ( name ),
       opener:users!shifts_opened_by_fkey ( email ),
       closer:users!shifts_closed_by_fkey ( email )`
    )
    .order('opened_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return data as ShiftWithNames[]
}

/**
 * Live, display-only summary of money collected since `windowStart`.
 * Buckets mirror the server-side close_shift computation so the dashboard
 * never surprises the frozen close figure:
 *   room  = SUM(base_rate + surcharges)  over sessions closed in the window
 *   addon = SUM(total - base_rate - surcharges) over the same sessions
 *   canteen = SUM(total) by sold_at
 * The authoritative numbers come from the RPC at close time.
 */
export async function fetchShiftSummary(
  branchId: string,
  windowStart: string
): Promise<ShiftSummary> {
  const [sessionsRes, canteenRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('total, base_rate, surcharges')
      .eq('branch_id', branchId)
      .neq('status', 'voided')
      .not('checked_out_at', 'is', null)
      .gte('checked_out_at', windowStart),
    supabase
      .from('canteen_sales')
      .select('total')
      .eq('branch_id', branchId)
      .gte('sold_at', windowStart),
  ])

  if (sessionsRes.error) throw sessionsRes.error
  if (canteenRes.error) throw canteenRes.error

  const sessions = sessionsRes.data ?? []
  const canteen = canteenRes.data ?? []

  const roomRevenue = sessions.reduce(
    (sum, s) =>
      sum + Number(s.base_rate ?? 0) + Number(s.surcharges ?? 0),
    0
  )
  const checkoutTotal = sessions.reduce((sum, s) => sum + Number(s.total ?? 0), 0)
  const canteenRevenue = canteen.reduce((sum, c) => sum + Number(c.total ?? 0), 0)

  return {
    branch_id: branchId,
    shift_id: null,
    window_start: windowStart,
    room_revenue: roomRevenue,
    addon_revenue: checkoutTotal - roomRevenue,
    canteen_revenue: canteenRevenue,
    total_revenue: checkoutTotal + canteenRevenue,
    sessions_count: sessions.length,
    canteen_sales_count: canteen.length,
  }
}
