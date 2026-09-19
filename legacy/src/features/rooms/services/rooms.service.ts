import { supabase } from '@/lib/supabase'
import type { Room } from '../types'

export async function fetchRooms(branchId: string) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('branch_id', branchId)
    .order('room_number', { ascending: true })

  if (error) throw error
  return data as Room[]
}

export async function updateRoomStatus(roomId: string, status: string) {
  const { error } = await supabase
    .from('rooms')
    .update({ status })
    .eq('id', roomId)

  if (error) throw error
}
