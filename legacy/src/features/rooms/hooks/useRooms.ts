import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { useAuthStore } from '@/store/auth.store'
import { fetchRooms } from '../services/rooms.service'

/** Room inventory for the cashier's branch (status grid + overstay ladder). */
export function useRooms() {
  const user = useAuthStore((s) => s.user)
  const branchId = user?.branch_id ?? ''

  return useQuery({
    queryKey: queryKeys.rooms.all(branchId),
    queryFn: () => fetchRooms(branchId),
    enabled: !!branchId,
    // Room status advances server-side (check-in trigger, grace-escalation
    // job, close_session release); a mounted query would otherwise never
    // move off a stale status because nothing else invalidates rooms.
    refetchInterval: 15_000,
  })
}
