import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { useAuthStore } from '@/store/auth.store'
import { openShift } from '../services/shift.service'

export function useStartShift() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const branchId = user?.branch_id ?? ''

  return useMutation({
    mutationFn: () => openShift(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.open(branchId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.summary(branchId) })
    },
  })
}
