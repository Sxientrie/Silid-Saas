export interface AuditLogEntry {
  id: string
  actor_id: string
  action: string
  target_table: string
  target_id: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ts: string
}
