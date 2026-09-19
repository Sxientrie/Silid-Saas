import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import type { Shift } from '../types'

type EndShiftDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  /** Display-only live total; the server seals the official figure at close. */
  liveExpectedTotal: number
  onConfirm: (countedTotal: number | null) => Promise<void>
}

/**
 * Collects the physically counted drawer amount before sealing the shift.
 * An empty count is allowed — the shift closes and an admin (or the shift's
 * cashier) can record the count afterwards.
 */
export function EndShiftDialog({
  open,
  onOpenChange,
  shift,
  liveExpectedTotal,
  onConfirm,
}: EndShiftDialogProps) {
  const [countedInput, setCountedInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const parsedCount = countedInput.trim() === '' ? null : Number(countedInput)
  const isValid =
    parsedCount === null || (Number.isFinite(parsedCount) && parsedCount >= 0)

  const handleConfirm = async () => {
    if (!isValid) return
    setIsSubmitting(true)
    try {
      await onConfirm(parsedCount)
      setCountedInput('')
      onOpenChange(false)
    } catch {
      // onConfirm surfaces the failure (toast); the dialog stays open with
      // the count intact so the cashier can retry without recounting.
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isSubmitting) onOpenChange(next) }}>
      <DialogContent>
        <DialogTitle>End shift &amp; count cash</DialogTitle>
        <DialogDescription>
          The server will seal this shift's expected cash the moment you confirm.
          Count the drawer physically and enter what is there.
        </DialogDescription>

        <div className="rounded-md border border-border bg-input/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Live expected (display only)</span>
            <CurrencyDisplay amount={liveExpectedTotal} className="font-semibold" />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Shift started</span>
            <span className="tabular-nums">
              {formatShiftStart(shift.opened_at)}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="counted-cash" className="text-sm font-medium text-foreground">
            Counted cash (₱)
          </label>
          <Input
            id="counted-cash"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="e.g. 12500"
            value={countedInput}
            onChange={(e) => setCountedInput(e.target.value)}
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to close without a count — it can be recorded afterwards
            by an admin. A count can never be overwritten once recorded.
          </p>
          {!isValid && (
            <p className="text-xs text-destructive">
              Enter a zero or positive amount, or leave the field empty.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!isValid || isSubmitting} onClick={handleConfirm}>
            {isSubmitting ? 'Sealing shift…' : 'End shift'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatShiftStart(iso: string): string {
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
