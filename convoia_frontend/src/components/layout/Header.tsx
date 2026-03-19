import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Menu, Search, Bell, Wallet, User, Key, LogOut, Sun, Moon } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useWallet } from '../../hooks/useWallet'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { formatCurrency } from '../../lib/utils'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/chat': 'Chat',
  '/models': 'AI Models',
  '/wallet': 'Wallet',
  '/usage': 'Usage',
  '/sessions': 'Sessions',
  '/api-keys': 'API Keys',
  '/settings': 'Settings',
  '/team': 'Team',
  '/budgets': 'Budgets',
  '/org': 'Organization',
  '/org/analytics': 'Organization Analytics',
  '/org/billing': 'Organization Billing',
  '/admin': 'Admin Dashboard',
  '/admin/orgs': 'Organizations',
  '/admin/users': 'Users',
  '/admin/models': 'Model Pricing',
  '/admin/revenue': 'Revenue',
}

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { wallet, setShowTopUp } = useWallet()

  const title = pageTitles[location.pathname] || 'Convoia AI'

  return (
    <header className="flex items-center justify-between shrink-0" style={{
      height: '52px', padding: '0 16px',
      background: 'var(--color-glass)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--chat-border)', zIndex: 20,
    }}>
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden"
          style={{ padding: '8px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '10px' }}
        >
          <Menu size={20} />
        </button>
        <h1 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>{title}</h1>
      </div>

      <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
        <div className="relative w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-dim)' }} />
          <input
            type="text"
            placeholder="Search..."
            style={{
              width: '100%', background: 'var(--chat-hover)', border: '1px solid var(--chat-border)',
              borderRadius: '10px', padding: '7px 14px 7px 36px', fontSize: '13px',
              color: 'var(--color-text-primary)', outline: 'none', transition: 'border-color 150ms',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-border-hover)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--chat-border)'}
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowTopUp(true)}
          className="hidden sm:flex items-center gap-2"
          style={{
            padding: '5px 10px', background: 'var(--chat-hover)', border: '1px solid var(--chat-border)',
            borderRadius: '10px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600,
            color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'border-color 150ms',
          }}
        >
          <div style={{ padding: '2px', background: 'var(--color-primary-light)', borderRadius: '4px' }}>
            <Wallet size={13} style={{ color: 'var(--color-primary)' }} />
          </div>
          {wallet ? formatCurrency(wallet.balance) : '$0.00'}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggleTheme}
          aria-label="Toggle theme"
          style={{ padding: '8px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '10px' }}
        >
          {theme === 'dark' ? <Sun size={18} style={{ color: '#F59E0B' }} /> : <Moon size={18} style={{ color: '#818CF8' }} />}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          className="relative"
          style={{ padding: '8px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '10px' }}
        >
          <Bell size={18} />
          <span className="absolute" style={{ top: '6px', right: '6px', width: '7px', height: '7px', background: 'var(--color-primary)', borderRadius: '50%' }} />
        </motion.button>

        {user && (
          <Dropdown
            trigger={
              <div style={{ padding: '2px', borderRadius: '10px', cursor: 'pointer' }}>
                <Avatar name={user.name} size="sm" />
              </div>
            }
            items={[
              { label: `${user.name}`, icon: <User size={14} />, onClick: () => navigate('/settings') },
              { label: '', icon: undefined, onClick: () => {}, divider: true },
              { label: 'Profile', icon: <User size={14} />, onClick: () => navigate('/settings') },
              { label: 'API Keys', icon: <Key size={14} />, onClick: () => navigate('/api-keys') },
              { label: '', icon: undefined, onClick: () => {}, divider: true },
              { label: 'Sign Out', icon: <LogOut size={14} />, onClick: logout, danger: true },
            ]}
          />
        )}
      </div>
    </header>
  )
}
