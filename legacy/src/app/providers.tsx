import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import type { ReactNode } from 'react'

import { useAuth } from '@/hooks/useAuth'

function AuthInitializer({ children }: { children: ReactNode }) {
  useAuth()
  return <>{children}</>
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthInitializer>
          {children}
        </AuthInitializer>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
