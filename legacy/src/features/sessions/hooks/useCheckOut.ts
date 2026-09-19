import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { useAuthStore } from '@/store/auth.store'
import { closeSession } from '../services/sessions.service'

/**
 * Check-out via the close_session RPC. Without invalidations the closed
 * session would sit in the active-sessions panel and the room would stay
 * 'occupied' in the grid until a full remount — desk-visible staleness.
 * The shift summary is invalidated too: extension blocks posted and totals
 * sealed by this checkout change the live expected-cash figure.
 */
export function useCheckOut() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  return useMutation({
    mutationFn: async (sessionId: string) => {
      // Calls the close_session RPC via service layer
      return await closeSession(sessionId)
    },
    onSuccess: () => {
      const branchId = user?.branch_id
      if (!branchId) return
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(branchId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all(branchId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.summary(branchId) })
    },
  })
}
