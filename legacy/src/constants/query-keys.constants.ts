export const queryKeys = {
  sessions: {
    all:    (branchId: string) => ['sessions', branchId]                   as const,
    active: (branchId: string) => ['sessions', branchId, 'active']         as const,
    byId:   (id: string)       => ['sessions', id]                         as const,
  },
  rooms: {
    all:    (branchId: string) => ['rooms', branchId]                      as const,
  },
  canteen: {
    sales:  (branchId: string) => ['canteen_sales', branchId]              as const,
  },
  shift: {
    open:    (branchId: string)        => ['shift', branchId, 'open']     as const,
    summary: (branchId: string)        => ['shift', branchId, 'summary']  as const,
    history: (branchId: string | 'all') => ['shift', branchId, 'history']  as const,
  },
  rates: {
    config: (branchId: string) => ['rates', branchId]                      as const,
  },
  audit: {
    log:    (branchId: string) => ['audit_log', branchId]                  as const,
  },
};
