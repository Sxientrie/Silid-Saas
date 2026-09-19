import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/constants/query-keys.constants'
import { useAuthStore } from '@/store/auth.store'
import { fetchCanteenSales } from '../services/canteen.service'

export function useCanteenSales() {
  const user = useAuthStore((s) => s.user)
  const branchId = user?.branch_id ?? ''

  return useQuery({
    queryKey: queryKeys.canteen.sales(branchId),
    queryFn: () => fetchCanteenSales(branchId),
    enabled: !!branchId,
  })
}
