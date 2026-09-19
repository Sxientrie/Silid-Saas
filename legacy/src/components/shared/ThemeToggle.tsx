import { Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { useUIStore } from '@/store/ui.store'

export function ThemeToggle() {
  const { theme, toggleTheme } = useUIStore()

  return (
    <Tooltip
      content={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      asChild
    >
      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {theme === 'dark' ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </Button>
    </Tooltip>
  )
}
