export const ROUTES = {
  LOGIN:          '/login',
  CASHIER: {
    DASHBOARD:    '/cashier',
    CHECK_IN:     '/cashier/check-in',
    CHECK_OUT:    '/cashier/check-out/:sessionId',
    CANTEEN:      '/cashier/canteen',
    SHIFT:        '/cashier/shift',
  },
  ADMIN: {
    DASHBOARD:    '/admin',
    AUDIT_LOG:    '/admin/audit',
    RATE_CONFIG:  '/admin/rates',
    STAFF:        '/admin/staff',
    SHIFTS:       '/admin/shifts',
  },
} as const;
