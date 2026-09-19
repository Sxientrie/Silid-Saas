import { useEffect, useState } from 'react'
import { Sun, Moon, Sunrise } from 'lucide-react'
import { USER_ROLE, type UserRole } from '@/constants/roles.constants'

export function HeaderGreeting({ userRole }: { userRole?: UserRole }) {
  const [greetingInfo, setGreetingInfo] = useState({ text: '', icon: Sun })

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours()
      if (hour < 12) setGreetingInfo({ text: 'Good morning', icon: Sunrise })
      else if (hour < 18) setGreetingInfo({ text: 'Good afternoon', icon: Sun })
      else setGreetingInfo({ text: 'Good evening', icon: Moon })
    }

    updateGreeting()
    const timer = setInterval(updateGreeting, 60000) // update every minute

    return () => clearInterval(timer)
  }, [])

  const roleDisplay = userRole === USER_ROLE.ADMIN ? 'Admin' : 'Cashier'
  const Icon = greetingInfo.icon

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 bg-accent/40 rounded-full border border-border shadow-sm ml-2">
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-background border border-border shadow-sm text-primary">
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-[15px] font-medium text-muted-foreground pr-1">
        {greetingInfo.text},{' '}
        <strong className="text-foreground font-bold">{roleDisplay}</strong>
      </span>
    </div>
  )
}
