import { supabase } from '@/lib/supabase'
import type { AuditLogEntry } from '../types'

export async function fetchAuditLog(_branchId: string) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('target_table', 'sessions')
    .order('ts', { ascending: false })

  if (error) throw error
  return data as AuditLogEntry[]
}

/**
 * Voids a session through the `void_session` RPC (migration 0012), which is
 * admin-only, requires a reason, marks the session voided, and writes the
 * audit row in the same transaction. The actor is derived server-side.
 */
export async function voidSession(sessionId: string, reason: string) {
  const { data, error } = await supabase.rpc('void_session', {
    p_session_id: sessionId,
    p_reason: reason,
  })

  if (error) throw error
  return data as unknown as Record<string, unknown>
}
