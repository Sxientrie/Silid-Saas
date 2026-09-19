import { db } from '@/lib/dexie'
import type { RateConfig } from '../types'

export async function cacheRateConfig(branchId: string, config: RateConfig) {
  await db.rates_cache.put({
    id: branchId, // Assuming one rate config per branch
    branch_id: branchId,
    rate_config: config.rate_config as Record<string, unknown>,
  })
}

export async function getCachedRateConfig(branchId: string): Promise<RateConfig | null> {
  const cached = await db.rates_cache.get(branchId)
  if (!cached) return null

  return {
    id: cached.id,
    name: 'Cached Branch', // Fallback, could also cache name
    rate_config: cached.rate_config as Record<string, unknown>,
  }
}
