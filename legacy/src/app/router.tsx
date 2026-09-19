import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ROUTES } from '@/constants/routes.constants'
import { AppShell } from '@/components/shared/AppShell'
import { AuthGuard } from '@/app/guards/AuthGuard'

// Auth
import { LoginPage } from '@/pages/auth/LoginPage'

// Cashier
import { CashierDashboardPage } from '@/pages/cashier/DashboardPage'
import { CheckInPage } from '@/pages/cashier/CheckInPage'
import { CheckOutPage } from '@/pages/cashier/CheckOutPage'
import { CanteenPage } from '@/pages/cashier/CanteenPage'
import { ShiftSummaryPage } from '@/pages/cashier/ShiftSummaryPage'

// Admin
import { AdminDashboardPage } from '@/pages/admin/DashboardPage'
import { AuditLogPage } from '@/pages/admin/AuditLogPage'
import { RateConfigPage } from '@/pages/admin/RateConfigPage'
import { AdminStaffPage } from '@/pages/admin/StaffPage'
import { ShiftHistoryPage } from '@/pages/admin/ShiftHistoryPage'

export const router = createBrowserRouter([
  // Public
  {
    path: ROUTES.LOGIN,
    element: <LoginPage />,
  },

  // Cashier routes — guarded by role
  {
    element: <AuthGuard requiredRole="cashier" />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: ROUTES.CASHIER.DASHBOARD,
            element: <CashierDashboardPage />,
          },
          {
            path: ROUTES.CASHIER.CHECK_IN,
            element: <CheckInPage />,
          },
          {
            path: ROUTES.CASHIER.CHECK_OUT,
            element: <CheckOutPage />,
          },
          {
            path: ROUTES.CASHIER.CANTEEN,
            element: <CanteenPage />,
          },
          {
            path: ROUTES.CASHIER.SHIFT,
            element: <ShiftSummaryPage />,
          },
        ],
      },
    ],
  },

  // Admin routes — guarded by role
  {
    element: <AuthGuard requiredRole="admin" />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: ROUTES.ADMIN.DASHBOARD,
            element: <AdminDashboardPage />,
          },
          {
            path: ROUTES.ADMIN.AUDIT_LOG,
            element: <AuditLogPage />,
          },
          {
            path: ROUTES.ADMIN.RATE_CONFIG,
            element: <RateConfigPage />,
          },
          {
            path: ROUTES.ADMIN.STAFF,
            element: <AdminStaffPage />,
          },
          {
            path: ROUTES.ADMIN.SHIFTS,
            element: <ShiftHistoryPage />,
          },
        ],
      },
    ],
  },

  // Fallback
  {
    path: '/',
    element: <Navigate to={ROUTES.LOGIN} replace />,
  },
  {
    path: '*',
    element: <Navigate to={ROUTES.LOGIN} replace />,
  },
])
