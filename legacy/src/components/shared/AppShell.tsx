import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  LogIn,
  LogOut,
  UtensilsCrossed,
  ClipboardList,
  Settings,
  FileText,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { OfflineBanner } from './OfflineBanner'
import { SettingsDialog } from './SettingsDialog'
import { SystemClock } from './SystemClock'
import { HeaderGreeting } from './HeaderGreeting'
import { useAuthStore } from '@/store/auth.store'
import { useUIStore } from '@/store/ui.store'
import { useSyncStore } from '@/store/sync.store'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { ROUTES } from '@/constants/routes.constants'
import { USER_ROLE } from '@/constants/roles.constants'

const CASHIER_NAV = [
  { to: ROUTES.CASHIER.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
  { to: ROUTES.CASHIER.CHECK_IN, label: 'Check In', icon: LogIn },
  { to: ROUTES.CASHIER.CANTEEN, label: 'Canteen', icon: UtensilsCrossed },
  { to: ROUTES.CASHIER.SHIFT, label: 'Shift Summary', icon: ClipboardList },
]

const ADMIN_NAV = [
  { to: ROUTES.ADMIN.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
  { to: ROUTES.ADMIN.SHIFTS, label: 'Shift History', icon: History },
  { to: ROUTES.ADMIN.AUDIT_LOG, label: 'Audit Log', icon: FileText },
  { to: ROUTES.ADMIN.RATE_CONFIG, label: 'Rate Config', icon: Settings },
  { to: ROUTES.ADMIN.STAFF, label: 'Staff Management', icon: Users },
]

/**
 * CSS-only text show/hide for the sidebar.
 * Elements are ALWAYS in the DOM — no React mount/unmount.
 */
const sidebarText = (open: boolean) =>
  cn(
    'overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-200',
    open ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0'
  )

/** Shared base classes for every interactive row in the sidebar (nav links + footer buttons). */
const SIDEBAR_ITEM =
  'flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors'

export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { sidebarOpen, toggleSidebar } = useUIStore()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  
  const isOnline = useOnlineStatus()
  const queueLength = useSyncStore((s) => s.queueLength)

  const navItems = user?.role === USER_ROLE.ADMIN ? ADMIN_NAV : CASHIER_NAV

  const handleLogout = () => {
    logout()
    navigate(ROUTES.LOGIN)
  }

  const footerTooltip = useUIStore((s) => s.footerTooltip)

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar — only transition width, clip overflow */}
      <aside
        className={cn(
          'flex shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out',
          sidebarOpen ? 'w-60' : 'w-16'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
          <span
            className={cn(
              'text-lg font-bold text-sidebar-foreground tracking-tight',
              sidebarText(sidebarOpen)
            )}
          >
            MotelTrack
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 overflow-hidden p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  SIDEBAR_ITEM,
                  isActive
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className={sidebarText(sidebarOpen)}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-sidebar-border p-2 pb-8 space-y-1">
          {/* Logout button */}
          <Tooltip content="Logout" asChild>
            <button
              onClick={handleLogout}
              className={cn(SIDEBAR_ITEM, 'text-sidebar-foreground hover:bg-sidebar-accent/50')}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className={sidebarText(sidebarOpen)}>Logout</span>
            </button>
          </Tooltip>

          {/* Settings button */}
          <Tooltip content="Settings" asChild>
            <button
              onClick={() => setSettingsOpen(true)}
              className={cn(SIDEBAR_ITEM, 'text-sidebar-foreground hover:bg-sidebar-accent/50')}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className={sidebarText(sidebarOpen)}>Settings</span>
            </button>
          </Tooltip>

          {/* Toggle Sidebar button */}
          <Tooltip content={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} asChild>
            <button
              onClick={toggleSidebar}
              className={cn(SIDEBAR_ITEM, 'text-sidebar-foreground hover:bg-sidebar-accent/50')}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4 shrink-0" />
              ) : (
                <PanelLeftOpen className="h-4 w-4 shrink-0" />
              )}
              <span className={sidebarText(sidebarOpen)}>Collapse</span>
            </button>
          </Tooltip>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background px-6">
          <HeaderGreeting userRole={user?.role} />
          
          <div className="flex-1" />
          
          <SystemClock isOnline={isOnline} />

          <OfflineBanner isOnline={isOnline} queueLength={queueLength} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>

        {/* IDE Footer */}
        <footer className="h-6 shrink-0 border-t border-border bg-muted/30 px-4 flex justify-between items-center text-[11px] text-muted-foreground tracking-wide font-medium">
          <span>{footerTooltip || 'Ready'}</span>
          <a 
            href="https://jasonrico.pages.dev/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="transition-colors hover:text-primary active:text-primary/80"
          >
            Developed by Jason Jamora ( Sxentrie IT Solutions )
          </a>
        </footer>
      </div>

      {/* Settings Modal */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
