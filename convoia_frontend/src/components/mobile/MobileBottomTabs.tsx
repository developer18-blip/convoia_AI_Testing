import { useLocation, useNavigate } from 'react-router-dom'
import { Home, MessageSquare, LayoutGrid, Wallet, User } from 'lucide-react'

const TABS = [
  { path: '/dashboard', icon: Home, label: 'Home' },
  { path: '/chat', icon: MessageSquare, label: 'Chat' },
  { path: '/models', icon: LayoutGrid, label: 'Agents' },
  { path: '/tokens/buy', icon: Wallet, label: 'Wallet' },
  { path: '/settings', icon: User, label: 'Profile' },
]

export function MobileBottomTabs() {
  const location = useLocation()
  const navigate = useNavigate()

  const idx = TABS.findIndex(t => location.pathname.startsWith(t.path))
  const activeTab = idx >= 0 ? idx : 0

  return (
    <nav className="mobile-tab-bar" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      display: 'flex', alignItems: 'stretch',
      height: '60px',
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid #E8E5F0',
    }}>
      {TABS.map((tab, i) => {
        const isActive = i === activeTab
        const Icon = tab.icon
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '2px', border: 'none', background: 'transparent', cursor: 'pointer',
              padding: '6px 0',
              color: isActive ? '#7C3AED' : '#9CA3AF',
              transition: 'color 150ms',
            }}
          >
            <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
            <span style={{
              fontSize: '10px', fontWeight: isActive ? 700 : 500,
              letterSpacing: '0.02em',
            }}>
              {tab.label}
            </span>
            {isActive && (
              <div style={{
                position: 'absolute', top: 0, width: '32px', height: '3px',
                borderRadius: '0 0 3px 3px', background: '#7C3AED',
              }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}
