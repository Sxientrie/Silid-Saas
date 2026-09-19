import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { fetchActiveSessions } from '../services/sessions.service'
import { useAuthStore } from '@/store/auth.store'

/**
 * Active sessions for the desk's overstay panel. The key MUST come from
 * queryKeys.sessions so mutation invalidations (check-in/check-out) can
 * reach this query by prefix — an ad-hoc literal key silently misses them.
 * 15s refetch keeps the ladder live for sessions other cashiers create or
 * close (multi-cashier branches are the normal case).
 */
export function useActiveSessions() {
  const user = useAuthStore((s) => s.user)
  const branchId = user?.branch_id

  return useQuery({
    queryKey: queryKeys.sessions.active(branchId ?? ''),
    queryFn: () => {
      if (!branchId) throw new Error('No branch ID')
      return fetchActiveSessions(branchId)
    },
    enabled: !!branchId,
    refetchInterval: 15_000,
  })
}
