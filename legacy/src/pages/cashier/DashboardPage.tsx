import { PageHeader } from '@/components/shared/PageHeader'
import { ActiveSessionsPanel } from '@/features/sessions/components/ActiveSessionsPanel'

export function CashierDashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Active sessions and overstay watch"
      />
      <ActiveSessionsPanel />
    </>
  )
}
