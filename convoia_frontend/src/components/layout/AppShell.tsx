import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileNav } from './MobileNav'

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const isChat = location.pathname === '/chat'

  return (
    <div className="flex bg-background overflow-hidden" style={{ height: '100dvh' }}>
      {/* Desktop sidebar — hidden on chat (chat has its own sidebar) */}
      {!isChat && (
        <div className="hidden lg:flex">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>
      )}

      {/* Mobile nav */}
      <MobileNav isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!isChat && <Header onMenuClick={() => setMobileMenuOpen(true)} />}
        <main className={`flex-1 overflow-y-auto overflow-x-hidden ${isChat ? 'p-0' : 'px-3 py-4 sm:p-4 lg:p-6'}`}>
          <Outlet />
        </main>
      </div>

    </div>
  )
}
