import { PageHeader } from '@/components/shared/PageHeader'

export function AuditLogPage() {
  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Full transaction audit trail"
      />
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Audit log table — pending implementation
        </p>
      </div>
    </>
  )
}
