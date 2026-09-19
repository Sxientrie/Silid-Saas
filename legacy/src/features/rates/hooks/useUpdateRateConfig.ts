import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateRateConfig } from '../services/rates.service'
import { rateConfigQueryKey } from './useRateConfig'

export interface RateConfigUpdate {
  branchId: string
  config: { canteen?: Record<string, number>; extension?: Record<string, number | undefined> }
}

export function useUpdateRateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ branchId, config }: RateConfigUpdate) =>
      updateRateConfig(branchId, config),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: rateConfigQueryKey(variables.branchId),
      })
    },
  })
}
