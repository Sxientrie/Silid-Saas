import { cn } from '@/lib/utils'

const PHP_LOCALE = 'fil-PH'
const PHP_CURRENCY = 'PHP'

type CurrencyDisplayProps = {
  amount: number
  className?: string
}

export function CurrencyDisplay({ amount, className }: CurrencyDisplayProps) {
  const formatted = new Intl.NumberFormat(PHP_LOCALE, {
    style: 'currency',
    currency: PHP_CURRENCY,
  }).format(amount)

  return <span className={cn('tabular-nums', className)}>{formatted}</span>
}
