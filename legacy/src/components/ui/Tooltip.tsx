import { Slot } from '@radix-ui/react-slot'
import { useUIStore } from '@/store/ui.store'
import type { ReactNode } from 'react'

export interface TooltipProps {
  content: string
  children: ReactNode
  asChild?: boolean
}

export function Tooltip({
  content,
  children,
  asChild = true,
}: TooltipProps) {
  const setFooterTooltip = useUIStore((s) => s.setFooterTooltip)
  const Comp = asChild ? Slot : 'div'

  return (
    <Comp
      onMouseEnter={() => setFooterTooltip(content)}
      onMouseLeave={() => setFooterTooltip(null)}
      onFocus={() => setFooterTooltip(content)}
      onBlur={() => setFooterTooltip(null)}
    >
      {children}
    </Comp>
  )
}
