import { useEffect } from 'react'
import { authService } from '@/features/auth/services/auth.service'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth.store'
import type { AuthUser } from '@/types/auth.types'
import type { UserRole } from '@/constants/roles.constants'

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } =
    useAuthStore()

  useEffect(() => {
    // Get initial session
    authService
      .getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          // Fetch role and branch from public.users table (secure source)
          const { data: profile, error } = await supabase
            .from('users')
            .select('role, branch_id')
            .eq('id', session.user.id)
            .single()

          if (error || !profile) {
            console.error('[auth] Failed to fetch user profile:', error)
            setUser(null)
            return
          }

          const authUser: AuthUser = {
            id: session.user.id,
            email: session.user.email ?? '',
            role: profile.role as UserRole,
            branch_id: profile.branch_id,
          }
          setUser(authUser)
        } else {
          setUser(null)
        }
      })
      .catch((err) => {
        console.error('[auth] Failed to get initial session:', err)
        setUser(null)
      })
      .finally(() => {
        setLoading(false)
      })

    // Listen for auth changes
    const {
      data: { subscription },
    } = authService.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          const { data: profile, error } = await supabase
            .from('users')
            .select('role, branch_id')
            .eq('id', session.user.id)
            .single()

          if (error || !profile) {
            console.warn('[auth] Profile missing for session user:', session.user.id)
            setUser(null) // This will set isLoading to false
            return
          }

          const authUser: AuthUser = {
            id: session.user.id,
            email: session.user.email ?? '',
            role: profile.role as UserRole,
            branch_id: profile.branch_id,
          }
          setUser(authUser)
        } catch (err) {
          console.error('[auth] Error during auth change handler:', err)
          setUser(null)
        }
      } else {
        setUser(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [setUser, setLoading])

  const signIn = async (email: string, password: string) => {
    setLoading(true)
    const { error } = await authService.signInWithPassword({
      email,
      password,
    })
    if (error) {
      setLoading(false)
      throw error
    }
  }

  const signOut = async () => {
    await authService.signOut()
    logout()
  }

  return { user, isAuthenticated, isLoading, signIn, signOut }
}
