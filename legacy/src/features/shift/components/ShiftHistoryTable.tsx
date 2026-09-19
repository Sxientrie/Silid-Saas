import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table'
import { useUIStore } from '@/store/ui.store'
import { useShiftHistory } from '../hooks/useShiftHistory'
import { useRecordShiftCount } from '../hooks/useRecordShiftCount'
import { formatVariance, varianceTone } from '../utils/variance'
import type { VarianceTone } from '../utils/variance'
import { RecordCountDialog } from './RecordCountDialog'
import type { ShiftWithNames } from '../types'

const VARIANCE_BADGE: Record<VarianceTone, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  short: 'destructive',
  over: 'default',
  even: 'secondary',
  none: 'outline',
}

/** Admin view of every shift across all branches, with variance reconciliation. */
export function ShiftHistoryTable() {
  const addToast = useUIStore((s) => s.addToast)
  const { data: shifts = [], isLoading } = useShiftHistory()
  const recordCount = useRecordShiftCount()
  const [countTarget, setCountTarget] = useState<ShiftWithNames | null>(null)

  const handleRecordCount = async (countedTotal: number) => {
    if (!countTarget) return
    try {
      await recordCount.mutateAsync({ shiftId: countTarget.id, countedTotal })
      addToast({ title: 'Count recorded', description: formatVariance(countedTotal - countTarget.expected_total) })
    } catch (err) {
      addToast({
        title: 'Could not record count',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
      // Rethrow so RecordCountDialog keeps the entry on screen for a retry.
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

  return (
    <>
      <PageHeader
        title="Shift History"
        description="Expected vs. counted cash per shift, across all branches"
      />

      {shifts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <EmptyState
            title="No shifts yet"
            description="Shifts appear here once cashiers start ending them at handover."
          />
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell className="font-medium">{shift.branches?.name ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">{formatDateTime(shift.opened_at)}</TableCell>
                  <TableCell className="tabular-nums">
                    {shift.closed_at ? formatDateTime(shift.closed_at) : '—'}
                  </TableCell>
                  <TableCell>{shift.opener?.email ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay amount={shift.expected_total} />
                  </TableCell>
                  <TableCell className="text-right">
                    {shift.counted_total !== null ? (
                      <CurrencyDisplay amount={shift.counted_total} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={VARIANCE_BADGE[varianceTone(shift.variance)]}>
                      {formatVariance(shift.variance)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {shift.status === 'closed' && shift.counted_total === null && (
                      <Button variant="outline" size="sm" onClick={() => setCountTarget(shift)}>
                        Record count
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {countTarget && (
        <RecordCountDialog
          shift={countTarget}
          open
          onOpenChange={(next) => { if (!next) setCountTarget(null) }}
          onConfirm={handleRecordCount}
        />
      )}
    </>
  )
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fil-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
