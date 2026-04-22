import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Search, Bell, Zap, User, Key, LogOut, Sun, Moon, CheckCheck, X, MessageSquare, Bot, Settings, BarChart3 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useTokens } from '../../contexts/TokenContext'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import api from '../../lib/api'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/chat': 'Intellect AI',
  '/models': 'AI Models',
  '/usage': 'Usage',
  '/api-keys': 'API Keys',
  '/settings': 'Settings',
  '/team': 'Team',
  '/budgets': 'Budgets',
  '/tokens/buy': 'Buy Tokens',
  '/org': 'Organization',
  '/org/analytics': 'Organization Analytics',
  '/org/billing': 'Organization Billing',
  '/admin': 'Admin Dashboard',
  '/admin/orgs': 'Organizations',
  '/admin/users': 'Users',
  '/admin/models': 'Model Pricing',
  '/admin/revenue': 'Revenue',
}

interface Notification {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

const searchItems = [
  { label: 'Intellect AI', path: '/chat', icon: <MessageSquare size={14} /> },
  { label: 'Dashboard', path: '/dashboard', icon: <BarChart3 size={14} /> },
  { label: 'Models', path: '/models', icon: <Bot size={14} /> },
  { label: 'Buy Tokens', path: '/tokens/buy', icon: <Zap size={14} /> },
  { label: 'Usage', path: '/usage', icon: <BarChart3 size={14} /> },
  { label: 'API Keys', path: '/api-keys', icon: <Key size={14} /> },
  { label: 'Settings', path: '/settings', icon: <Settings size={14} /> },
  { label: 'Team', path: '/team', icon: <User size={14} /> },
]

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { formattedBalance } = useTokens()

  const canBuyTokens = !user?.organizationId || user?.role === 'org_owner' || user?.role === 'platform_admin'
  const title = pageTitles[location.pathname] || 'ConvoiaAI'

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifs, setShowNotifs] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const filteredSearch = searchQuery.trim()
    ? searchItems.filter(item => item.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  const fetchNotifications = useCallback(async () => {
    try {
      const [notifRes, countRes] = await Promise.all([
        api.get('/notifications?limit=10'),
        api.get('/notifications/count'),
      ])
      setNotifications(notifRes.data.data?.notifications || [])
      setUnreadCount(countRes.data.data?.unreadCount || 0)
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false)
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch {}
  }

  const markOneRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {}
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

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
          style={{ padding: '12px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Menu size={20} />
        </button>
        <h1 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>{title}</h1>
      </div>

      {/* Search Bar */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-8" ref={searchRef}>
        <div className="relative w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-dim)' }} />
          <input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true) }}
            onFocus={(e) => { setShowSearch(true); e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-glow)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--chat-border)'; e.currentTarget.style.boxShadow = 'none' }}
            className="search-bar"
            style={{
              width: '100%', background: 'var(--chat-hover)', border: '1px solid var(--chat-border)',
              borderRadius: '10px', padding: '7px 14px 7px 36px', fontSize: '13px',
              color: 'var(--color-text-primary)', outline: 'none', transition: 'border-color 200ms, box-shadow 200ms',
            }}
          />
          <AnimatePresence>
            {showSearch && searchQuery.trim() && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                style={{
                  position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--chat-bg)', border: '1px solid var(--chat-border)',
                  borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                }}
              >
                {filteredSearch.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                    No results found
                  </div>
                ) : (
                  filteredSearch.map(item => (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); setSearchQuery(''); setShowSearch(false) }}
                      className="flex items-center gap-3 w-full"
                      style={{
                        padding: '10px 14px', background: 'none', border: 'none',
                        color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: '13px',
                        transition: 'background 150ms', textAlign: 'left',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--chat-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                      <span style={{ color: 'var(--color-text-muted)' }}>{item.icon}</span>
                      {item.label}
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Token balance */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => canBuyTokens ? navigate('/tokens/buy') : navigate('/dashboard')}
          className="hidden sm:flex items-center gap-2"
          style={{
            padding: '5px 10px', background: 'var(--chat-hover)', border: '1px solid var(--chat-border)',
            borderRadius: '10px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600,
            color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'border-color 150ms',
          }}
        >
          <Zap size={13} style={{ color: 'var(--color-accent-end)' }} />
          {formattedBalance}
        </motion.button>

        {/* Theme toggle */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggleTheme}
          aria-label="Toggle theme"
          style={{ padding: '10px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {theme === 'dark' ? <Sun size={18} style={{ color: 'var(--color-warning)' }} /> : <Moon size={18} style={{ color: 'var(--color-accent-end)' }} />}
        </motion.button>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowNotifs(prev => !prev)}
            style={{ padding: '10px', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute flex items-center justify-center" style={{
                top: '4px', right: '4px', minWidth: '16px', height: '16px',
                background: 'var(--color-danger)', borderRadius: '8px', fontSize: '9px',
                fontWeight: 700, color: 'white', padding: '0 4px',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </motion.button>

          <AnimatePresence>
            {showNotifs && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                style={{
                  position: 'absolute', top: '110%', right: '-8px', width: 'min(340px, calc(100vw - 32px))', zIndex: 50,
                  background: 'var(--chat-bg)', border: '1px solid var(--chat-border)',
                  borderRadius: '14px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--chat-border)' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Notifications
                  </span>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="flex items-center gap-1"
                        style={{ fontSize: '11px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <CheckCheck size={12} /> Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifs(false)}
                      style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Notification List */}
                <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                      <Bell size={28} style={{ color: 'var(--color-text-dim)', margin: '0 auto 8px' }} />
                      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div
                        key={notif.id}
                        onClick={() => !notif.isRead && markOneRead(notif.id)}
                        style={{
                          padding: '12px 14px', cursor: 'pointer',
                          borderBottom: '1px solid var(--chat-border)',
                          background: notif.isRead ? 'transparent' : 'var(--color-primary-glow)',
                          transition: 'background 150ms',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--chat-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = notif.isRead ? 'transparent' : 'var(--color-primary-glow)'}
                      >
                        <div className="flex items-start gap-2">
                          {!notif.isRead && (
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)', marginTop: '6px', flexShrink: 0 }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                              {notif.title}
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0', lineHeight: 1.4 }}>
                              {notif.message}
                            </p>
                            <p style={{ fontSize: '10px', color: 'var(--color-text-dim)', margin: '4px 0 0' }}>
                              {timeAgo(notif.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User dropdown */}
        {user && (
          <Dropdown
            trigger={
              <div style={{ padding: '2px', borderRadius: '10px', cursor: 'pointer' }}>
                <Avatar name={user.name} src={user.avatar} size="sm" />
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
