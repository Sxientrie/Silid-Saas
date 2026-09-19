import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { useAuthStore } from '@/store/auth.store'
import { createCanteenSale } from '../services/canteen.service'
import type { CreateCanteenSalePayload } from '../types'

export function useLogCanteenSale() {
  const user = useAuthStore((s) => s.user)
  const branchId = user?.branch_id ?? ''
  const cashierId = user?.id ?? ''
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateCanteenSalePayload) =>
      createCanteenSale(branchId, cashierId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.canteen.sales(branchId),
      })
    },
  })
}
