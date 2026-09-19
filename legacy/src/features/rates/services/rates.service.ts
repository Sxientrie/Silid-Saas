import { supabase } from '@/lib/supabase'
import type { RateConfig } from '../types'
import { cacheRateConfig, getCachedRateConfig } from './rates.local'

export async function fetchRateConfig(branchId: string) {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, rate_config')
      .eq('id', branchId)
      .single()

    if (error) throw error
    
    // Cache it for offline use
    await cacheRateConfig(branchId, data as RateConfig)
    return data as RateConfig
  } catch (err) {
    console.warn('Network fetch failed, trying local cache', err)
    const cached = await getCachedRateConfig(branchId)
    if (cached) return cached
    throw err
  }
}

export async function fetchBranches() {
  const { data, error } = await supabase
    .from('branches')
    .select('id, name')
    .order('name')

  if (error) throw error
  return data as { id: string; name: string }[]
}

/**
 * Saves the two sections the rate editor owns (canteen prices, overstay
 * params) through the `update_rate_config` RPC (migration 0014), which
 * merges them into branches.rate_config and preserves every other key.
 * A table UPDATE would clobber concurrent admins' edits and silently drop
 * unknown keys — the RPC is the only sanctioned write path.
 */
export async function updateRateConfig(
  branchId: string,
  config: { canteen?: Record<string, number>; extension?: Record<string, number | undefined> }
) {
  const { data, error } = await supabase.rpc('update_rate_config', {
    p_branch_id: branchId,
    p_canteen: config.canteen ?? {},
    p_extension: config.extension ?? {},
  })

  if (error) throw error
  return data
}
