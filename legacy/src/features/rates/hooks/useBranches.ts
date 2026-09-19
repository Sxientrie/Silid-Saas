import { useQuery } from '@tanstack/react-query'
import { fetchBranches } from '../services/rates.service'
import type { Branch } from '../types'

export const BRANCHES_QUERY_KEY = ['branches']

export function useBranches() {
  return useQuery<Branch[]>({
    queryKey: BRANCHES_QUERY_KEY,
    queryFn: fetchBranches,
  })
}
