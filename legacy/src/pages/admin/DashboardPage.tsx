import { PageHeader } from '@/components/shared/PageHeader'

export function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        description="Live revenue across all branches"
      />
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Multi-branch live view — pending implementation
        </p>
      </div>
    </>
  )
}
