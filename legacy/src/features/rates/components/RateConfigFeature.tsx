import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CANTEEN_ITEMS } from '@/constants/canteen.constants'
import { DEFAULT_OVERSTAY_PARAMS } from '@/features/sessions/utils/overstay'
import { useBranches } from '../hooks/useBranches'
import { useRateConfig } from '../hooks/useRateConfig'
import { useUpdateRateConfig } from '../hooks/useUpdateRateConfig'
import { useUIStore } from '@/store/ui.store'

// Type alias (not interface) so it carries an implicit index signature and
// stays assignable to the Json-shaped record the update_rate_config RPC expects.
type ExtensionOverrides = {
  grace_minutes?: number
  block_minutes?: number
  charge_php?: number
}

// get_extension_params (migration 0013) caps integer params at 9 digits so
// its ::int cast can never overflow — anything longer is treated as unset.
const EXTENSION_INT_MAX = 999_999_999

/**
 * Mirrors what the server will actually honor. A value outside these rules
 * does not error on the server — it is silently replaced by the system
 * default (25 / 60 / ₱150), so saving it would mislead the admin about the
 * branch's real overstay billing. Block here instead.
 */
function extensionFieldError(
  key: keyof ExtensionOverrides,
  value: number | undefined
): string | null {
  if (value === undefined) return null
  if (!Number.isFinite(value)) return 'Enter a number'
  if (key === 'charge_php') {
    if (value <= 0)
      return 'Must be above zero — ₱0 would silently fall back to the default'
    const text = String(value)
    if (!/^\d+(\.\d+)?$/.test(text) || text.length > 12)
      return 'Up to 12 digits with optional decimals'
    return null
  }
  if (!Number.isInteger(value)) return 'Whole minutes only'
  if (key === 'block_minutes' ? value < 1 : value < 0)
    return key === 'block_minutes' ? 'At least 1 minute' : 'Cannot be negative'
  if (value > EXTENSION_INT_MAX)
    return `At most ${EXTENSION_INT_MAX.toLocaleString('en-US')} minutes`
  return null
}

const EXTENSION_FIELDS: {
  key: keyof ExtensionOverrides
  label: string
  placeholder: number
  hint: string
}[] = [
  {
    key: 'grace_minutes',
    label: 'Grace period (minutes)',
    placeholder: DEFAULT_OVERSTAY_PARAMS.graceMinutes,
    hint: 'Free time after the booked end before charges start',
  },
  {
    key: 'block_minutes',
    label: 'Extension block (minutes)',
    placeholder: DEFAULT_OVERSTAY_PARAMS.blockMinutes,
    hint: 'One charge per started block past the grace period',
  },
  {
    key: 'charge_php',
    label: 'Extension charge (₱)',
    placeholder: DEFAULT_OVERSTAY_PARAMS.chargePhp,
    hint: 'Price of one extension block',
  },
]

export function RateConfigFeature() {
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [canteenPrices, setCanteenPrices] = useState<Record<string, number>>({})
  const [extension, setExtension] = useState<ExtensionOverrides>({})
  const addToast = useUIStore((s) => s.addToast)

  const { data: branches = [], isLoading: isLoadingBranches } = useBranches()

  // Select first branch by default (derived — no effect needed).
  const effectiveBranchId = selectedBranchId || branches[0]?.id || ''

  const { data: rateConfig, isLoading: isLoadingConfig, isFetching } = useRateConfig(
    effectiveBranchId || null
  )
  const updateRates = useUpdateRateConfig()

  // Sync editor state when the config loads or changes: the render-derive
  // guard from the React docs (no sync setState inside effects). This also
  // restores saved canteen overrides after a refetch.
  const [lastSyncedConfig, setLastSyncedConfig] = useState(rateConfig)
  if (rateConfig !== lastSyncedConfig) {
    setLastSyncedConfig(rateConfig)
    setCanteenPrices(rateConfig?.rate_config?.canteen ?? {})
    const saved = rateConfig?.rate_config?.extension as ExtensionOverrides | undefined
    setExtension({
      grace_minutes: saved?.grace_minutes,
      block_minutes: saved?.block_minutes,
      charge_php: saved?.charge_php,
    })
  }

  const handlePriceChange = (itemId: string, value: string) => {
    const num = parseInt(value, 10)
    if (isNaN(num) && value !== '') return // allow empty for deleting
    if (!isNaN(num) && num < 0) return // a negative override would fail every sale insert (unit_price >= 0, migration 0013)

    setCanteenPrices((prev) => {
      const next = { ...prev }
      if (value === '') {
        delete next[itemId] // Revert to default
      } else {
        next[itemId] = num
      }
      return next
    })
  }

  const handleExtensionChange = (key: keyof ExtensionOverrides, value: string) => {
    setExtension((prev) => {
      const next = { ...prev }
      if (value === '') {
        delete next[key] // Revert to system default
      } else {
        const num = Number(value)
        if (Number.isFinite(num) && num >= 0) {
          next[key] = num
        }
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!effectiveBranchId || !rateConfig) return

    const newConfig = {
      ...rateConfig.rate_config,
      canteen: canteenPrices,
      extension: extension,
    }

    try {
      await updateRates.mutateAsync({
        branchId: effectiveBranchId,
        config: newConfig,
      })
      addToast({
        title: 'Success',
        description: 'Rates saved successfully',
        variant: 'default',
      })
    } catch (e) {
      console.error(e)
      addToast({
        title: 'Error',
        description: 'Failed to save rates',
        variant: 'destructive',
      })
    }
  }

  const isSaving = updateRates.isPending

  // Per-field errors over the CURRENT editor state; save stays blocked while
  // any extension override would be silently ignored by the server.
  const extensionErrors: Partial<Record<keyof ExtensionOverrides, string>> = {}
  for (const field of EXTENSION_FIELDS) {
    const message = extensionFieldError(field.key, extension[field.key])
    if (message) extensionErrors[field.key] = message
  }
  const hasExtensionErrors = Object.keys(extensionErrors).length > 0

  if (isLoadingBranches) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Rate Configuration"
        description="Manage room rates and canteen prices per branch"
      />

      <div className="flex gap-6">
        {/* Left Column: Branch List */}
        <div className="w-64 shrink-0 space-y-2">
          <h3 className="text-sm font-semibold text-foreground mb-3">Select Branch</h3>
          <div className="flex flex-col gap-1">
            {branches.map((branch) => (
              <button
                key={branch.id}
                onClick={() => setSelectedBranchId(branch.id)}
                className={`text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  effectiveBranchId === branch.id
                    ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                {branch.name}
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Editor */}
        <div className="flex-1 space-y-6">
          {isLoadingConfig || isFetching ? (
            <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card">
              <LoadingSpinner />
            </div>
          ) : !effectiveBranchId ? (
            <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card">
              <p className="text-sm text-muted-foreground">Select a branch to edit</p>
            </div>
          ) : (
            <>
              {/* Room Rates Placeholder */}
              <div className="rounded-lg border border-border bg-card p-6 opacity-60">
                <h3 className="text-base font-semibold text-foreground mb-1">
                  Room Rates
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Short time and overnight rate configuration pending implementation.
                </p>
                <div className="bg-muted rounded-md p-4 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground font-mono">
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.entries(rateConfig?.rate_config || {}).filter(
                          ([k]) => k !== 'canteen' && k !== 'extension'
                        )
                      )
                    )}
                  </span>
                </div>
              </div>

              {/* Overstay Billing */}
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Overstay Billing
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Extension blocks bill per started block past the grace period,
                      charged at checkout. Leave blank to use the system default.
                    </p>
                  </div>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving || hasExtensionErrors}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {EXTENSION_FIELDS.map((field) => {
                    const value = extension[field.key]
                    return (
                      <div key={field.key} className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-foreground">
                          {field.label}
                        </label>
                        <Input
                          type="number"
                          min={field.key === 'grace_minutes' ? 0 : 1}
                          placeholder={String(field.placeholder)}
                          value={value !== undefined ? String(value) : ''}
                          onChange={(e) => handleExtensionChange(field.key, e.target.value)}
                          className="w-full h-9"
                        />
                        {extensionErrors[field.key] ? (
                          <p className="text-xs text-destructive">
                            {extensionErrors[field.key]}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{field.hint}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Canteen Prices Editor */}
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Canteen Prices
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Leave blank to use the system default price.
                    </p>
                  </div>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving || hasExtensionErrors}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                  {CANTEEN_ITEMS.map((item) => {
                    const hasOverride = item.id in canteenPrices
                    const displayValue = hasOverride ? canteenPrices[item.id].toString() : ''
                    
                    return (
                      <div key={item.id} className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-foreground truncate">
                          {item.label}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            ₱
                          </span>
                          <Input
                            type="number"
                            placeholder={item.price_php.toString()}
                            value={displayValue}
                            onChange={(e) => handlePriceChange(item.id, e.target.value)}
                            className="pl-7 w-full h-9"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
