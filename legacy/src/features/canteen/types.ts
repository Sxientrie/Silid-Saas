import type { CanteenItemId } from '@/constants/canteen.constants'
import type { CANTEEN_CATEGORIES } from '@/constants/canteen.constants'

export interface CanteenSale {
  id: string
  branch_id: string
  cashier_id: string
  item: CanteenItemId
  qty: number
  unit_price: number
  total: number
  sold_at: string
}

export interface CreateCanteenSalePayload {
  item: CanteenItemId
  qty: number
  unit_price: number
}

export type CanteenCategory = keyof typeof CANTEEN_CATEGORIES

export interface CanteenCartItem {
  id: CanteenItemId
  label: string
  category: CanteenCategory
  price_php: number
  qty: number
  lineTotal: number
}
