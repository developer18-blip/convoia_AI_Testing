import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { MobileBottomTabs } from './MobileBottomTabs'
import { ScreenErrorBoundary } from '../shared/ErrorBoundary'

/**
 * Mobile-only app shell. Replaces AppShell when running in Capacitor.
 * - Applies .mobile-app class for purple light theme
 * - Bottom tab navigation instead of sidebar
 * - No desktop header or sidebar
 */
export function MobileAppShell() {
  const location = useLocation()
  // Chat page manages its own full-bleed layout
  const isChat = location.pathname === '/chat'

  // Strip rich formatting on copy — prevents background colors / boxes from
  // ending up in the clipboard when the user copies text from styled bubbles.
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return
      const plainText = selection.toString()
      if (!plainText) return
      e.preventDefault()
      e.clipboardData?.setData('text/plain', plainText)
    }
    document.addEventListener('copy', handleCopy)
    return () => document.removeEventListener('copy', handleCopy)
  }, [])

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
        flex: 1, overflowY: isChat ? 'hidden' : 'auto', overflowX: 'hidden',
        padding: isChat ? 0 : undefined,
      }}>
        <ScreenErrorBoundary><Outlet /></ScreenErrorBoundary>
      </main>

      {/* Bottom tab bar */}
      <MobileBottomTabs />
    </div>
  )
}
