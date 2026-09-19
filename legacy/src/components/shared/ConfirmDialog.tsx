import * as React from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/Button'
import { overlayAnimation, dialogContentAnimation } from '@/lib/motion'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  destructive?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  // Failsafe: clean up pointer-events if unmounted mid-animation
  React.useEffect(() => {
    return () => {
      document.body.style.pointerEvents = ''
    }
  }, [])

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <AlertDialog.Portal forceMount>
            {/* Overlay — opacity tween */}
            <AlertDialog.Overlay asChild forceMount>
              <motion.div
                {...overlayAnimation}
                className="fixed inset-0 z-50 bg-black/80"
              />
            </AlertDialog.Overlay>

            {/* Content — spring physics */}
            <AlertDialog.Content asChild forceMount>
              <motion.div
                {...dialogContentAnimation}
                className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg p-6 shadow-lg w-full max-w-md"
              >
                <AlertDialog.Title className="text-base font-semibold text-foreground mb-1">
                  {title}
                </AlertDialog.Title>
                <AlertDialog.Description className="text-sm text-muted-foreground mb-6">
                  {description}
                </AlertDialog.Description>
                <div className="flex justify-end gap-3">
                  <AlertDialog.Cancel asChild>
                    <Button variant="outline">Cancel</Button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <Button
                      variant={destructive ? 'destructive' : 'default'}
                      onClick={onConfirm}
                    >
                      {confirmLabel}
                    </Button>
                  </AlertDialog.Action>
                </div>
              </motion.div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        )}
      </AnimatePresence>
    </AlertDialog.Root>
  )
}
