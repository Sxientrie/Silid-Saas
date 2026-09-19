import { useQuery } from '@tanstack/react-query'
import { fetchRateConfig } from '../services/rates.service'
import type { RateConfig } from '../types'

export const rateConfigQueryKey = (branchId: string) => ['rateConfig', branchId]

export function useRateConfig(branchId: string | null) {
  return useQuery<RateConfig>({
    queryKey: rateConfigQueryKey(branchId!),
    queryFn: () => fetchRateConfig(branchId!),
    enabled: !!branchId,
  })
}
