import { Minus, Plus, Trash2, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { EmptyState } from '@/components/shared/EmptyState'
import type { CanteenCartItem } from '../types'

type CanteenCartProps = {
  items: CanteenCartItem[]
  onUpdateQty: (itemId: string, delta: number) => void
  onRemoveItem: (itemId: string) => void
  onClear: () => void
  onConfirm: () => void
  isSubmitting: boolean
}

export function CanteenCart({
  items,
  onUpdateQty,
  onRemoveItem,
  onClear,
  onConfirm,
  isSubmitting,
}: CanteenCartProps) {
  const grandTotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
  const isEmpty = items.length === 0

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Cart</h3>
        {!isEmpty && (
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary tabular-nums">
            {items.reduce((sum, i) => sum + i.qty, 0)}
          </span>
        )}
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {isEmpty ? (
          <EmptyState
            title="Cart is empty"
            description="Tap items on the left to add them"
            className="py-10"
          />
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2"
            >
              {/* Item info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {item.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <CurrencyDisplay amount={item.price_php} className="text-[11px]" /> × {item.qty}
                </p>
              </div>

              {/* Qty controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onUpdateQty(item.id, -1)}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-6 text-center text-xs font-bold tabular-nums text-foreground">
                  {item.qty}
                </span>
                <button
                  onClick={() => onUpdateQty(item.id, 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              {/* Line total + remove */}
              <div className="flex items-center gap-1.5 ml-1">
                <CurrencyDisplay
                  amount={item.lineTotal}
                  className="text-xs font-semibold text-foreground w-14 text-right"
                />
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer — total + actions */}
      <div className="border-t border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <CurrencyDisplay
            amount={grandTotal}
            className="text-lg font-bold text-foreground"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onClear}
            disabled={isEmpty || isSubmitting}
          >
            Clear
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={onConfirm}
            disabled={isEmpty || isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Confirm Sale'}
          </Button>
        </div>
      </div>
    </div>
  )
}
