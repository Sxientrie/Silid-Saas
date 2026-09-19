import { supabase } from '@/lib/supabase'

export const staffService = {
  fetchStaff: async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*, branches(name)')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data
  }
}
