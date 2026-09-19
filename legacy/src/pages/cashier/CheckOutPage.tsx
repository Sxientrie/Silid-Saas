import { PageHeader } from '@/components/shared/PageHeader'

export function CheckOutPage() {
  return (
    <>
      <PageHeader
        title="Check Out"
        description="Process guest check-out and finalize charges"
      />
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Check-out flow — pending implementation
        </p>
      </div>
    </>
  )
}
