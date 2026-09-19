import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useAuth } from '@/hooks/useAuth'
import { AlertCircle, KeyRound, User, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type LoginMode = 'staff' | 'admin'

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn, isLoading } = useAuth()
  
  const [mode, setMode] = useState<LoginMode>('staff')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!identifier || !password) {
      setError(`Please enter your ${mode === 'staff' ? 'identifier and passcode' : 'email and password'}.`)
      return
    }

    try {
      // Map simple identifier to internal email ONLY in staff mode
      const email = (mode === 'staff' && !identifier.includes('@'))
        ? `${identifier}@moteltrack.internal` 
        : identifier

      await signIn(email, password)
      
      // Navigate to root which will redirect via AuthGuard
      setTimeout(() => navigate('/'), 100)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid credentials.'
      setError(message)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl" />
      
      <div className="w-full max-w-[400px] space-y-8 animate-in fade-in zoom-in duration-700">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 mb-4">
            {mode === 'staff' ? (
              <User className="text-primary-foreground w-6 h-6" />
            ) : (
              <ShieldCheck className="text-primary-foreground w-6 h-6" />
            )}
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text">
            MotelTrack
          </h1>
          <p className="text-muted-foreground text-sm">
            {mode === 'staff' ? 'Staff Station Login' : 'Admin Management Access'}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-8 shadow-2xl shadow-foreground/5 space-y-6">
          {/* Mode Switcher */}
          <div className="flex p-1 bg-muted rounded-lg">
            <button
              onClick={() => { setMode('staff'); setError(null); }}
              className={cn(
                "flex-1 py-2 text-xs font-medium rounded-md transition-all",
                mode === 'staff' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Staff Member
            </button>
            <button
              onClick={() => { setMode('admin'); setError(null); }}
              className={cn(
                "flex-1 py-2 text-xs font-medium rounded-md transition-all",
                mode === 'admin' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              System Admin
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {mode === 'staff' ? 'Identifier / ID' : 'Admin Email'}
              </Label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input 
                  id="identifier" 
                  placeholder={mode === 'staff' ? "e.g. cashier_01" : "admin@moteltrack.com"} 
                  className="pl-10 h-12 bg-background/50 border-border/50 focus:border-primary/50 transition-all"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {mode === 'staff' ? 'Passcode / PIN' : 'Password'}
              </Label>
              <div className="relative group">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input 
                  id="password" 
                  type="password"
                  placeholder="••••••" 
                  className="pl-10 h-12 bg-background/50 border-border/50 focus:border-primary/50 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs animate-in slide-in-from-top-2 duration-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" 
              disabled={isLoading}
            >
              {isLoading ? 'Authenticating...' : 'Sign In'}
            </Button>
          </form>
        </div>
        
        <p className="text-center text-[10px] text-muted-foreground/60 mt-12 tracking-widest uppercase">
          <a 
            href="https://jasonrico.pages.dev/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="transition-colors hover:text-primary"
          >
            Developed by Jason Jamora ( Sxentrie IT Solutions )
          </a>
        </p>
      </div>
    </div>
  )
}
