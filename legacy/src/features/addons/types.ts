import type { AddonItemId } from '@/constants/addon.constants'

export interface SessionAddon {
  id: string
  session_id: string
  item: AddonItemId
  qty: number
  unit_price: number
  total: number
  added_at: string
  cashier_id: string
}

export interface CreateAddonPayload {
  session_id: string
  item: AddonItemId
  qty: number
  unit_price: number
}
