import { supabase } from '@/lib/supabase'
import type { CanteenSale, CreateCanteenSalePayload } from '../types'

export async function fetchCanteenSales(branchId: string) {
  const { data, error } = await supabase
    .from('canteen_sales')
    .select('*')
    .eq('branch_id', branchId)
    .order('sold_at', { ascending: false })

  if (error) throw error
  return data as CanteenSale[]
}

export async function createCanteenSale(
  branchId: string,
  cashierId: string,
  payload: CreateCanteenSalePayload
) {
  const { data, error } = await supabase
    .from('canteen_sales')
    .insert({
      branch_id: branchId,
      cashier_id: cashierId,
      item: payload.item,
      qty: payload.qty,
      unit_price: payload.unit_price,
      total: payload.unit_price * payload.qty,
    })
    .select()
    .single()

  if (error) throw error
  return data as CanteenSale
}
