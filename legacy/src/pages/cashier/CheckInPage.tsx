import { PageHeader } from '@/components/shared/PageHeader'

export function CheckInPage() {
  return (
    <>
      <PageHeader
        title="Check In"
        description="Register a new guest check-in"
      />
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Check-in form — pending implementation
        </p>
      </div>
    </>
  )
}
