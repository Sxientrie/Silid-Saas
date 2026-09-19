import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { ShiftWithNames } from '../types'

type RecordCountDialogProps = {
  shift: ShiftWithNames
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (countedTotal: number) => Promise<void>
}

/** Admin recovers a missed physical count on a closed shift. One-shot: the server rejects a second recording. */
export function RecordCountDialog({ shift, open, onOpenChange, onConfirm }: RecordCountDialogProps) {
  const [countedInput, setCountedInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const parsedCount = Number(countedInput)
  const isValid = countedInput.trim() !== '' && Number.isFinite(parsedCount) && parsedCount >= 0

  const handleConfirm = async () => {
    if (!isValid) return
    setIsSubmitting(true)
    try {
      await onConfirm(parsedCount)
      setCountedInput('')
      onOpenChange(false)
    } catch {
      // onConfirm surfaces the failure (toast); keep the amount for a retry.
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isSubmitting) onOpenChange(next) }}>
      <DialogContent>
        <DialogTitle>Record shift count</DialogTitle>
        <DialogDescription>
          This shift closed without a recorded count. Enter the amount that was
          physically counted at handover. It can never be overwritten.
        </DialogDescription>

        <div className="rounded-md border border-border bg-input/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Expected cash</span>
            <span className="font-semibold tabular-nums">
              ₱{shift.expected_total.toLocaleString('fil-PH')}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="record-count" className="text-sm font-medium text-foreground">
            Counted cash (₱)
          </label>
          <Input
            id="record-count"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="e.g. 12500"
            value={countedInput}
            onChange={(e) => setCountedInput(e.target.value)}
            disabled={isSubmitting}
          />
          {!isValid && countedInput.trim() !== '' && (
            <p className="text-xs text-destructive">Enter a zero or positive amount.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!isValid || isSubmitting} onClick={handleConfirm}>
            {isSubmitting ? 'Recording…' : 'Record count'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
