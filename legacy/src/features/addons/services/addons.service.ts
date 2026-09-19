import { supabase } from '@/lib/supabase'
import type { SessionAddon, CreateAddonPayload } from '../types'

export async function fetchAddons(sessionId: string) {
  const { data, error } = await supabase
    .from('session_addons')
    .select('*')
    .eq('session_id', sessionId)
    .order('added_at', { ascending: false })

  if (error) throw error
  return data as SessionAddon[]
}

export async function createAddon(
  cashierId: string,
  payload: CreateAddonPayload
) {
  const { data, error } = await supabase
    .from('session_addons')
    .insert({
      session_id: payload.session_id,
      cashier_id: cashierId,
      item: payload.item,
      qty: payload.qty,
      unit_price: payload.unit_price,
      total: payload.unit_price * payload.qty,
    })
    .select()
    .single()

  if (error) throw error
  return data as SessionAddon
}
