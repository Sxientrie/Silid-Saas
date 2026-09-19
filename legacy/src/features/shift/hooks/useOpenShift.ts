import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { useAuthStore } from '@/store/auth.store'
import { fetchOpenShift } from '../services/shift.service'

/** The branch's currently open shift, or null when no shift is open. */
export function useOpenShift() {
  const user = useAuthStore((s) => s.user)
  const branchId = user?.branch_id ?? ''

  return useQuery({
    queryKey: queryKeys.shift.open(branchId),
    queryFn: () => fetchOpenShift(branchId),
    enabled: !!branchId,
    refetchInterval: 15_000,
  })
}
