import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/store/ui.store'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useOpenShift } from '../hooks/useOpenShift'
import { useShiftSummary } from '../hooks/useShiftSummary'
import { useStartShift } from '../hooks/useStartShift'
import { useCloseShift } from '../hooks/useCloseShift'
import { formatVariance } from '../utils/variance'
import { EndShiftDialog } from './EndShiftDialog'

/**
 * Cashier shift view: open a shift, watch live collections, end the shift
 * with a physical cash count. Closing is online-only — expected cash is
 * sealed by the server, and sealing wrong totals offline would defeat the
 * whole reconciliation.
 */
export function ShiftSummaryView() {
  const addToast = useUIStore((s) => s.addToast)
  const isOnline = useOnlineStatus()

  const { data: openShift, isLoading } = useOpenShift()
  const { data: summary } = useShiftSummary(openShift?.opened_at ?? null)
  const startShift = useStartShift()
  const closeShift = useCloseShift()

  const [endDialogOpen, setEndDialogOpen] = useState(false)

  const handleStart = async () => {
    try {
      await startShift.mutateAsync()
      addToast({ title: 'Shift started', description: 'Collections are now recorded against this shift.' })
    } catch (err) {
      addToast({
        title: 'Could not start shift',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleConfirmEnd = async (countedTotal: number | null) => {
    if (!openShift) return
    try {
      const closed = await closeShift.mutateAsync({
        shiftId: openShift.id,
        countedTotal,
      })
      addToast({
        title: 'Shift closed',
        description:
          `Expected ₱${closed.expected_total.toLocaleString('fil-PH')}` +
          (closed.counted_total !== null
            ? ` · Counted ₱${closed.counted_total.toLocaleString('fil-PH')} · ${formatVariance(closed.variance)}`
            : ' · no count recorded yet'),
      })
    } catch (err) {
      addToast({
        title: 'Could not end shift',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
      // Rethrow so EndShiftDialog knows the close failed and keeps the
      // typed count on screen instead of discarding it.
      throw err instanceof Error ? err : new Error('Unknown error')
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    )
  }

  if (!openShift) {
    return (
      <>
        <PageHeader title="Shift Summary" description="Open a shift to begin recording collections" />
        <div className="rounded-lg border border-border bg-card p-6">
          <EmptyState
            title="No open shift"
            description="Start a shift before taking check-ins or canteen sales. Ending the shift seals its expected cash for handover."
            action={
              <Button onClick={handleStart} disabled={!isOnline || startShift.isPending}>
                {startShift.isPending ? 'Starting…' : 'Start shift'}
              </Button>
            }
          />
          {!isOnline && (
            <p className="text-center text-xs text-muted-foreground">
              Starting or ending a shift requires a connection.
            </p>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Shift Summary" description="Review collections before handover" />

      {!isOnline && (
        <div className="mb-4 rounded-md border border-border bg-destructive/10 p-3 text-sm text-destructive">
          You are offline. Ending the shift is disabled — expected cash must be
          sealed by the server, and pending offline activity would be missed.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryTile label="Room revenue" amount={summary?.room_revenue ?? 0} />
          <SummaryTile label="Add-on charges" amount={summary?.addon_revenue ?? 0} />
          <SummaryTile label="Canteen sales" amount={summary?.canteen_revenue ?? 0} />
          <SummaryTile label="Expected cash" amount={summary?.total_revenue ?? 0} emphasize />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-border pt-4 text-sm text-muted-foreground">
          <span>Sessions closed: <strong className="text-foreground">{summary?.sessions_count ?? 0}</strong></span>
          <span>Canteen sales: <strong className="text-foreground">{summary?.canteen_sales_count ?? 0}</strong></span>
          <span>Shift started: <strong className="text-foreground tabular-nums">{formatTime(openShift.opened_at)}</strong></span>
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            variant="destructive"
            disabled={!isOnline || closeShift.isPending}
            onClick={() => setEndDialogOpen(true)}
          >
            End shift &amp; count cash
          </Button>
        </div>
      </div>

      <EndShiftDialog
        open={endDialogOpen}
        onOpenChange={setEndDialogOpen}
        shift={openShift}
        liveExpectedTotal={summary?.total_revenue ?? 0}
        onConfirm={handleConfirmEnd}
      />
    </>
  )
}

function SummaryTile({
  label,
  amount,
  emphasize = false,
}: {
  label: string
  amount: number
  emphasize?: boolean
}) {
  return (
    <div
      className={
        emphasize
          ? 'rounded-md border border-primary/30 bg-primary/5 p-3'
          : 'rounded-md border border-border p-3'
      }
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <CurrencyDisplay amount={amount} className={emphasize ? 'text-lg font-semibold' : 'text-base'} />
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fil-PH', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
