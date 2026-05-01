import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface SidebarContextValue {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (v: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

const KEY = 'convoia_settings_sidebar_collapsed'

function loadInitial(): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    return raw === 'true'
  } catch { return false }
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState<boolean>(loadInitial)

  useEffect(() => {
    try { localStorage.setItem(KEY, String(collapsed)) } catch { /* ignore */ }
  }, [collapsed])

  const toggle = () => setCollapsedState((c) => !c)
  const setCollapsed = (v: boolean) => setCollapsedState(v)

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used inside SidebarProvider')
  return ctx
}
