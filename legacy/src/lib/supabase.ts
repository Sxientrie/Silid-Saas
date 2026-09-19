import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.types'

// These will need to be provided in your .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
