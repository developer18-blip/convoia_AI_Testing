import { useLocation, useNavigate } from 'react-router-dom'
import { Home, MessageSquare, Sparkles, Wallet, User } from 'lucide-react'

const TABS = [
  { path: '/dashboard', icon: Home, label: 'Home' },
  { path: '/chat', icon: MessageSquare, label: 'Chat' },
  { path: '/models', icon: Sparkles, label: 'Agents' },
  { path: '/tokens/buy', icon: Wallet, label: 'Wallet' },
  { path: '/settings', icon: User, label: 'Profile' },
]

const WALLET_ROUTES = ['/tokens', '/org/billing', '/payment']
const PROFILE_ROUTES = [
  '/org',
  '/team',
  '/budgets',
  '/budget',
  '/usage',
  '/tasks',
  '/sessions',
  '/api-keys',
  '/api-docs',
  '/admin',
]

function getActiveTabIndex(pathname: string) {
  const directMatch = TABS.findIndex(t => pathname === t.path || pathname.startsWith(`${t.path}/`))
  if (directMatch >= 0) return directMatch
  if (WALLET_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))) return 3
  if (PROFILE_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))) return 4
  return 0
}

export function MobileBottomTabs() {
  const location = useLocation()
  const navigate = useNavigate()

  const activeTab = getActiveTabIndex(location.pathname)

  return (
    <nav className="mobile-tab-bar" aria-label="Primary navigation">
      {TABS.map((tab, i) => {
        const isActive = i === activeTab
        const Icon = tab.icon
        return (
          <button
            key={tab.path}
            className={`mobile-tab-bar__item${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={tab.label}
            onClick={() => navigate(tab.path)}
          >
            <span className="mobile-tab-bar__icon">
              <Icon size={19} strokeWidth={isActive ? 2.5 : 1.9} />
            </span>
            <span className="mobile-tab-bar__label">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
