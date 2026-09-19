import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type LoadingSpinnerProps = {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <Loader2 className={cn('animate-spin text-muted-foreground', SIZES[size])} />
    </div>
  )
}
