import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { useAuthStore } from '@/store/auth.store'
import { fetchShiftSummary } from '../services/shift.service'

/**
 * Live, display-only collection totals since the open shift started.
 * Disabled until there is a shift window to sum over; authoritative figures
 * are sealed server-side at close.
 */
export function useShiftSummary(windowStart: string | null) {
  const user = useAuthStore((s) => s.user)
  const branchId = user?.branch_id ?? ''

  return useQuery({
    queryKey: [...queryKeys.shift.summary(branchId), windowStart],
    queryFn: () => fetchShiftSummary(branchId, windowStart as string),
    enabled: !!branchId && !!windowStart,
    refetchInterval: 15_000,
  })
}
