import type { RoomStatus } from '@/constants/room.constants'

export interface Room {
  id: string
  branch_id: string
  room_number: string
  status: RoomStatus
}
