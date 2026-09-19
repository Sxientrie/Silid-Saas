import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { EmptyState } from '@/components/shared/EmptyState'
import { CANTEEN_ITEMS } from '@/constants/canteen.constants'
import type { CanteenSale } from '../types'

type CanteenSaleListProps = {
  sales: CanteenSale[]
  isLoading: boolean
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function getItemLabel(itemId: string): string {
  const found = CANTEEN_ITEMS.find((i) => i.id === itemId)
  return found?.label ?? itemId
}

export function CanteenSaleList({ sales, isLoading }: CanteenSaleListProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8">
        <p className="text-center text-sm text-muted-foreground animate-pulse">
          Loading sales…
        </p>
      </div>
    )
  }

  if (sales.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          title="No sales yet"
          description="Sales you confirm will appear here"
        />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-center w-16">Qty</TableHead>
            <TableHead className="text-right w-24">Unit Price</TableHead>
            <TableHead className="text-right w-24">Total</TableHead>
            <TableHead className="text-right w-24">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => (
            <TableRow key={sale.id}>
              <TableCell className="font-medium">
                {getItemLabel(sale.item)}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {sale.qty}
              </TableCell>
              <TableCell className="text-right">
                <CurrencyDisplay amount={sale.unit_price} />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <CurrencyDisplay amount={sale.total} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground text-xs">
                {formatTime(sale.sold_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
