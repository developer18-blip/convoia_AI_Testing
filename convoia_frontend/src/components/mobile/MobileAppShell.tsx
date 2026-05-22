import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { MobileBottomTabs } from './MobileBottomTabs'
import { MobilePageHeader } from './MobilePageHeader'
import { ScreenErrorBoundary } from '../shared/ErrorBoundary'

const PRIMARY_ROUTES = new Set(['/dashboard', '/chat', '/models', '/tokens/buy', '/settings'])

const ROUTE_TITLES: Array<[RegExp, { title: string; subtitle?: string }]> = [
  [/^\/org\/billing$/, { title: 'Billing', subtitle: 'Token pool and purchases' }],
  [/^\/org\/analytics$/, { title: 'Analytics', subtitle: 'Usage, spend, and model insights' }],
  [/^\/org$/, { title: 'Organization', subtitle: 'Workspace settings' }],
  [/^\/team\/[^/]+$/, { title: 'Member', subtitle: 'Profile and usage' }],
  [/^\/team$/, { title: 'Team', subtitle: 'Members, roles, and invites' }],
  [/^\/budgets?$/, { title: 'Budgets', subtitle: 'Token limits and controls' }],
  [/^\/budget$/, { title: 'My Budget', subtitle: 'Your monthly token limit' }],
  [/^\/usage$/, { title: 'Usage', subtitle: 'Queries, tokens, and spend' }],
  [/^\/tasks$/, { title: 'Tasks', subtitle: 'Work items and activity' }],
  [/^\/sessions$/, { title: 'Sessions', subtitle: 'Hourly access and history' }],
  [/^\/api-keys$/, { title: 'API Keys', subtitle: 'Access tokens and keys' }],
  [/^\/api-docs$/, { title: 'API Docs', subtitle: 'Developer reference' }],
  [/^\/payment\/success$/, { title: 'Payment', subtitle: 'Purchase complete' }],
  [/^\/payment\/cancel$/, { title: 'Payment', subtitle: 'Purchase cancelled' }],
  [/^\/admin\/orgs\/[^/]+$/, { title: 'Organization', subtitle: 'Admin detail' }],
  [/^\/admin\/users\/[^/]+$/, { title: 'User', subtitle: 'Admin detail' }],
  [/^\/admin\/orgs$/, { title: 'Organizations', subtitle: 'Platform admin' }],
  [/^\/admin\/users$/, { title: 'Users', subtitle: 'Platform admin' }],
  [/^\/admin\/revenue$/, { title: 'Revenue', subtitle: 'Platform income' }],
  [/^\/admin\/analytics$/, { title: 'Analytics', subtitle: 'Platform report' }],
  [/^\/admin\/models$/, { title: 'Models', subtitle: 'AI configuration' }],
  [/^\/admin\/send-tokens$/, { title: 'Send Tokens', subtitle: 'Grant balances' }],
  [/^\/admin\/create-account$/, { title: 'Create Account', subtitle: 'New user setup' }],
]

function routeHeader(pathname: string) {
  for (const [pattern, value] of ROUTE_TITLES) {
    if (pattern.test(pathname)) return value
  }
  return { title: 'Convoia', subtitle: 'Mobile workspace' }
}

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
  const isPrimaryRoute = PRIMARY_ROUTES.has(location.pathname)
  const showInnerHeader = !isChat && !isPrimaryRoute
  const header = routeHeader(location.pathname)

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
      background: 'var(--color-background)',
      color: 'var(--color-text-primary)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* Page content — scrollable, accounts for tab bar */}
      <main className="mobile-app-content" style={{
        flex: 1, minHeight: 0,
        display: isChat ? 'flex' : undefined,
        flexDirection: isChat ? 'column' as const : undefined,
        overflowY: isChat ? 'hidden' : 'auto', overflowX: 'hidden',
        padding: isChat ? 0 : undefined,
        WebkitOverflowScrolling: 'touch' as const,
      }}>
        <ScreenErrorBoundary>
          {showInnerHeader ? (
            <div className="mobile-route-frame">
              <MobilePageHeader title={header.title} subtitle={header.subtitle} />
              <div className="mobile-route-body">
                <Outlet />
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </ScreenErrorBoundary>
      </main>

      {/* Bottom tab bar — hidden on chat so the conversation gets the full screen */}
      {!isChat && <MobileBottomTabs />}
    </div>
  )
}
