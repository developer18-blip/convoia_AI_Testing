import { Outlet } from 'react-router-dom'
import { MobileBottomTabs } from './MobileBottomTabs'

/**
 * Mobile-only app shell. Replaces AppShell when running in Capacitor.
 * - Applies .mobile-app class for purple light theme
 * - Bottom tab navigation instead of sidebar
 * - No desktop header or sidebar
 */
export function MobileAppShell() {
  return (
    <div className="mobile-app" style={{
      display: 'flex', flexDirection: 'column',
      height: '100dvh', overflow: 'hidden',
      background: 'var(--color-background)',
      color: 'var(--color-text-primary)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* Page content — scrollable, accounts for tab bar */}
      <main className="mobile-app-content" style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
      }}>
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      <MobileBottomTabs />
    </div>
  )
}
