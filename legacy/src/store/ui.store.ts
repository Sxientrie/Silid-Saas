import { create } from 'zustand'

type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'moteltrack-theme'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return 'light'
}

function applyThemeToDOM(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

interface UIState {
  sidebarOpen: boolean
  activeModal: string | null
  toastQueue: ToastItem[]
  theme: Theme
  footerTooltip: string | null
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  openModal: (modalId: string) => void
  closeModal: () => void
  addToast: (toast: Omit<ToastItem, 'id'>) => void
  removeToast: (id: string) => void
  setFooterTooltip: (tooltip: string | null) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export interface ToastItem {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  activeModal: null,
  toastQueue: [],
  theme: getInitialTheme(),
  footerTooltip: null,

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  openModal: (modalId) => set({ activeModal: modalId }),

  closeModal: () => set({ activeModal: null }),

  addToast: (toast) =>
    set((state) => ({
      toastQueue: [
        ...state.toastQueue,
        { ...toast, id: crypto.randomUUID() },
      ],
    })),

  removeToast: (id) =>
    set((state) => ({
      toastQueue: state.toastQueue.filter((t) => t.id !== id),
    })),

  setFooterTooltip: (tooltip) => set({ footerTooltip: tooltip }),

  setTheme: (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    applyThemeToDOM(theme)
    set({ theme })
  },

  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_STORAGE_KEY, next)
      applyThemeToDOM(next)
      return { theme: next }
    }),
}))

