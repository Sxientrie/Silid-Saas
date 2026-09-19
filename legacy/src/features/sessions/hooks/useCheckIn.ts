import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { createSession } from '../services/sessions.service'
import type { CreateSessionPayload } from '../types'
import { useAuthStore } from '@/store/auth.store'

export function useCheckIn() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  return useMutation({
    mutationFn: async (payload: CreateSessionPayload) => {
      if (!user?.branch_id) throw new Error('User has no assigned branch')
      return createSession(user.branch_id, user.id, payload)
    },
    onSuccess: () => {
      if (!user?.branch_id) return
      // The session INSERT also flips the room to 'occupied' server-side
      // (migration 0013 trigger), so rooms must refresh with it. The
      // sessions key is invalidated as a prefix so the active-sessions
      // panel picks the new guest up immediately.
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(user.branch_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all(user.branch_id) })
    },
  })
}
