import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { fetchShiftHistory } from '../services/shift.service'

/** Closed-shift history across all branches (admin view). */
export function useShiftHistory() {
  return useQuery({
    queryKey: queryKeys.shift.history('all'),
    queryFn: () => fetchShiftHistory(),
  })
}
