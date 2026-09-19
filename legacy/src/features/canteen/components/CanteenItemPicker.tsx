import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CANTEEN_CATEGORIES } from '@/constants/canteen.constants'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import type { CanteenCategory, CanteenCartItem } from '../types'

type ItemType = Omit<CanteenCartItem, 'qty' | 'lineTotal'>

type CanteenItemPickerProps = {
  items: ItemType[]
  onAddItem: (item: ItemType) => void
}

const CATEGORY_KEYS = Object.keys(CANTEEN_CATEGORIES) as CanteenCategory[]

export function CanteenItemPicker({ items, onAddItem }: CanteenItemPickerProps) {
  const [activeCategory, setActiveCategory] = useState<CanteenCategory>('DRINKS')

  const filteredItems = items.filter(
    (item) => item.category === activeCategory
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Category Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {CATEGORY_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={cn(
              'shrink-0 rounded-md px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-colors',
              activeCategory === key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            )}
          >
            {CANTEEN_CATEGORIES[key]}
          </button>
        ))}
      </div>

      {/* Item Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {filteredItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onAddItem(item)}
            className="group flex flex-col items-start gap-1.5 rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.97]"
          >
            <span className="text-sm font-medium text-foreground leading-tight line-clamp-2">
              {item.label}
            </span>
            <CurrencyDisplay
              amount={item.price_php}
              className="text-xs font-semibold text-primary"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
