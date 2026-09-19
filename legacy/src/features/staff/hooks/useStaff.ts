import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffService } from '../services/staff.service'
import { authService } from '@/features/auth/services/auth.service'

export function useStaff() {
  const queryClient = useQueryClient()

  const staffQuery = useQuery({
    queryKey: ['staff'],
    queryFn: staffService.fetchStaff,
  })

  const createUserMutation = useMutation({
    mutationFn: authService.createStaffUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })

  return {
    staff: staffQuery.data ?? [],
    isLoading: staffQuery.isLoading,
    error: staffQuery.error,
    createUser: createUserMutation,
  }
}
