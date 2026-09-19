import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

export const authService = {
  getSession: () => supabase.auth.getSession(),
  onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
    return supabase.auth.onAuthStateChange(callback)
  },
  signInWithPassword: (credentials: { email: string; password: string }) => {
    return supabase.auth.signInWithPassword(credentials)
  },
  signOut: () => supabase.auth.signOut(),
  createStaffUser: (payload: {
    username: string
    password: string
    role: 'cashier' | 'admin'
    branch_id: string | null
  }) => {
    return supabase.functions.invoke('create-staff-user', {
      body: payload,
    })
  },
}
