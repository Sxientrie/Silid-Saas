import { supabase } from '@/lib/supabase'
import { SESSION_STATUS } from '@/constants/room.constants'
import type { Session, CreateSessionPayload } from '../types'

export async function fetchActiveSessions(branchId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', SESSION_STATUS.ACTIVE)
    .order('checked_in_at', { ascending: false })

  if (error) throw error
  return data as Session[]
}



export async function fetchSessionById(sessionId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error) throw error
  return data as Session
}

export async function createSession(
  branchId: string,
  cashierId: string,
  payload: CreateSessionPayload
) {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      branch_id: branchId,
      cashier_id: cashierId,
      room_id: payload.room_id,
      booking_type: payload.booking_type,
      pax: payload.pax,
    })
    .select()
    .single()

  if (error) throw error
  return data as Session
}

/**
 * Close a session via server-side RPC.
 *
 * Sessions are immutable from the frontend — no direct UPDATE is allowed.
 * The `close_session` RPC function must be deployed to Supabase and handles
 * setting status = 'closed', recording checked_out_at, and computing the final total.
 */
export async function closeSession(sessionId: string) {
  const { data, error } = await supabase.rpc('close_session', {
    p_session_id: sessionId,
  })

  if (error) throw error
  return data as unknown as Session
}
