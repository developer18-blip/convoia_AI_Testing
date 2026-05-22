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
  // Chat manages its own full-bleed layout. The other mobile-native pages
  // (Home/Agents/Settings/Wallet) already supply their own padding; everything
  // else is a desktop page rendered in the webview and needs gutters so its
  // content doesn't run into the screen edges.
  const isChat = location.pathname === '/chat'
  const MOBILE_NATIVE = ['/dashboard', '/admin', '/models', '/settings', '/tokens/buy']
  const needsGutter = !isChat && !MOBILE_NATIVE.includes(location.pathname)

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
        ...(isChat ? { padding: 0 } : {}),
        ...(needsGutter ? { paddingTop: 14, paddingLeft: 14, paddingRight: 14 } : {}),
      }}>
        <ScreenErrorBoundary><Outlet /></ScreenErrorBoundary>
      </main>

      {/* Bottom tab bar */}
      <MobileBottomTabs />
    </div>
  )
}
