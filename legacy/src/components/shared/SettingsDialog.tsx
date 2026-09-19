import { Sun, Moon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog'
import { Separator } from '@/components/ui/Separator'
import { useUIStore } from '@/store/ui.store'
import { cn } from '@/lib/utils'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { theme, setTheme } = useUIStore()

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your MotelTrack preferences
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Appearance */}
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium text-foreground">Appearance</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose your preferred theme
            </p>
          </div>
          <div className="flex gap-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
                  theme === option.value
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground'
                )}
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* App Info */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">About</h4>
          <div className="grid grid-cols-2 gap-y-1.5 text-xs">
            <span className="text-muted-foreground">Version</span>
            <span className="text-foreground text-right">0.1.0-dev</span>
            <span className="text-muted-foreground">Build</span>
            <span className="text-foreground text-right">Development</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
