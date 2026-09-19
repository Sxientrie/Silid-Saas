import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ROUTES } from '@/constants/routes.constants'
import type { UserRole } from '@/constants/roles.constants'

type AuthGuardProps = {
  requiredRole?: UserRole
}

export function AuthGuard({ requiredRole }: AuthGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuthStore()

  // Still checking auth state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    )
  }

  // Not logged in — send to login
  if (!isAuthenticated || !user) {
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  // Logged in but wrong role — redirect to their own dashboard
  if (requiredRole && user.role !== requiredRole) {
    const fallback =
      user.role === 'admin'
        ? ROUTES.ADMIN.DASHBOARD
        : ROUTES.CASHIER.DASHBOARD
    return <Navigate to={fallback} replace />
  }

  return <Outlet />
}
