import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { useAuthStore } from '@/store/auth.store'
import { closeShift } from '../services/shift.service'

export function useCloseShift() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const branchId = user?.branch_id ?? ''

  return useMutation({
    mutationFn: ({
      shiftId,
      countedTotal,
    }: {
      shiftId: string
      countedTotal: number | null
    }) => closeShift(shiftId, countedTotal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.open(branchId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.summary(branchId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.history('all') })
    },
  })
}
