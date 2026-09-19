import { useState, useCallback, useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { CanteenItemPicker } from './CanteenItemPicker'
import { CanteenCart } from './CanteenCart'
import { CanteenSaleList } from './CanteenSaleList'
import { useCanteenSales } from '../hooks/useCanteenSales'
import { useLogCanteenSale } from '../hooks/useLogCanteenSale'
import { CANTEEN_ITEMS } from '@/constants/canteen.constants'
import type { CanteenCartItem } from '../types'
import { useAuthStore } from '@/store/auth.store'
import { useRateConfig } from '@/features/rates/hooks/useRateConfig'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useUIStore } from '@/store/ui.store'

export function CanteenFeature() {
  const [cart, setCart] = useState<CanteenCartItem[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const addToast = useUIStore((s) => s.addToast)

  const user = useAuthStore((s) => s.user)
  const { data: sales = [], isLoading } = useCanteenSales()
  const { data: rateConfig, isLoading: isLoadingConfig } = useRateConfig(user?.branch_id || null)
  const logSale = useLogCanteenSale()

  // Compute dynamic items based on rate_config overrides
  const dynamicItems = useMemo(() => {
    return CANTEEN_ITEMS.map((item) => {
      const overridePrice = rateConfig?.rate_config?.canteen?.[item.id]
      return {
        ...item,
        price_php: overridePrice !== undefined ? overridePrice : item.price_php,
      }
    })
  }, [rateConfig])

  // --- Cart actions ---

  const handleAddItem = useCallback((item: Omit<CanteenCartItem, 'qty' | 'lineTotal'>) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id)
      if (existing) {
        return prev.map((c) =>
          c.id === item.id
            ? { ...c, qty: c.qty + 1, lineTotal: (c.qty + 1) * c.price_php }
            : c
        )
      }
      return [
        ...prev,
        {
          id: item.id,
          label: item.label,
          category: item.category,
          price_php: item.price_php,
          qty: 1,
          lineTotal: item.price_php,
        },
      ]
    })
  }, [])

  const handleUpdateQty = useCallback((itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.id !== itemId) return c
          const newQty = c.qty + delta
          if (newQty <= 0) return null
          return { ...c, qty: newQty, lineTotal: newQty * c.price_php }
        })
        .filter(Boolean) as CanteenCartItem[]
    )
  }, [])

  const handleRemoveItem = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((c) => c.id !== itemId))
  }, [])

  const handleClear = useCallback(() => {
    setCart([])
  }, [])

  // --- Submit ---

  const handleConfirmSale = async () => {
    // Log each cart item as a separate canteen sale
    const promises = cart.map((item) =>
      logSale.mutateAsync({
        item: item.id,
        qty: item.qty,
        unit_price: item.price_php,
      })
    )

    try {
      await Promise.all(promises)
      setCart([])
      setConfirmOpen(false)
      addToast({
        title: 'Success',
        message: 'Canteen sale recorded',
        type: 'success',
      })
    } catch (err) {
      console.error('Canteen sale failed:', err)
      addToast({
        title: 'Error',
        message: 'Failed to record some or all items',
        type: 'error',
      })
    }
  }

  const grandTotal = cart.reduce((sum, item) => sum + item.lineTotal, 0)

  return (
    <>
      <PageHeader
        title="Canteen"
        description="Record canteen sales"
      />

      {/* Two-column POS layout */}
      <div className="flex gap-4 mb-6 min-h-[420px]">
        {/* Left — Item picker (wider) */}
        <div className="flex-1 rounded-lg border border-border bg-card p-4 overflow-y-auto relative">
          {isLoadingConfig ? (
            <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm z-10 rounded-lg">
              <LoadingSpinner />
            </div>
          ) : null}
          <CanteenItemPicker items={dynamicItems} onAddItem={handleAddItem} />
        </div>

        {/* Right — Cart (narrower, fixed) */}
        <div className="w-80 shrink-0">
          <CanteenCart
            items={cart}
            onUpdateQty={handleUpdateQty}
            onRemoveItem={handleRemoveItem}
            onClear={handleClear}
            onConfirm={() => setConfirmOpen(true)}
            isSubmitting={logSale.isPending}
          />
        </div>
      </div>

      {/* Sales log table */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Sales This Shift</h2>
        <CanteenSaleList sales={sales} isLoading={isLoading} />
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm Canteen Sale"
        description={`${cart.length} item${cart.length !== 1 ? 's' : ''} — total: ₱${grandTotal.toLocaleString()}`}
        confirmLabel="Confirm Sale"
        onConfirm={handleConfirmSale}
      />
    </>
  )
}
