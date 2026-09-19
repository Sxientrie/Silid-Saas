import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { recordShiftCount } from '../services/shift.service'

export function useRecordShiftCount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      shiftId,
      countedTotal,
    }: {
      shiftId: string
      countedTotal: number
    }) => recordShiftCount(shiftId, countedTotal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.history('all') })
    },
  })
}
