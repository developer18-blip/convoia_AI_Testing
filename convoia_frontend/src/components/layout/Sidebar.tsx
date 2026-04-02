import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, MessageSquare, Bot, BarChart3, Zap, Key,
  Settings, Users, Target, ChevronLeft, ChevronRight,
  LogOut, Plus, Building2, TrendingUp, CheckSquare, Coins, Shield,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTokens } from '../../contexts/TokenContext'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { cn } from '../../lib/utils'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onClose?: () => void
}

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
}

function getNavItems(role: string, hasOrg: boolean): NavItem[] {
  const base: NavItem[] = [
    { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/dashboard' },
    { icon: <MessageSquare size={20} />, label: 'Chat', path: '/chat' },
    { icon: <Bot size={20} />, label: 'Models', path: '/models' },
  ]

  const settingsItem: NavItem = { icon: <Settings size={20} />, label: 'Settings', path: '/settings' }

  // Individual/Freelancer (no org OR role='user')
  if (!hasOrg || role === 'user') {
    return [
      ...base,
      { icon: <Coins size={20} />, label: 'Buy Tokens', path: '/tokens/buy' },
      { icon: <BarChart3 size={20} />, label: 'Usage', path: '/usage' },
      { icon: <Key size={20} />, label: 'API Keys', path: '/api-keys' },
      settingsItem,
    ]
  }

  // Employee
  if (role === 'employee') {
    return [
      ...base,
      { icon: <Target size={20} />, label: 'My Budget', path: '/budget' },
      { icon: <BarChart3 size={20} />, label: 'My Usage', path: '/usage' },
      { icon: <CheckSquare size={20} />, label: 'My Tasks', path: '/tasks' },
      settingsItem,
    ]
  }

  // Manager
  if (role === 'manager') {
    return [
      ...base,
      { icon: <Users size={20} />, label: 'My Team', path: '/team' },
      { icon: <Target size={20} />, label: 'Budgets', path: '/budgets' },
      { icon: <BarChart3 size={20} />, label: 'Team Usage', path: '/usage' },
      { icon: <CheckSquare size={20} />, label: 'Tasks', path: '/tasks' },
      settingsItem,
    ]
  }

  // Org Owner
  if (role === 'org_owner') {
    return [
      ...base,
      { icon: <Users size={20} />, label: 'Team', path: '/team' },
      { icon: <Coins size={20} />, label: 'Token Pools', path: '/tokens' },
      { icon: <BarChart3 size={20} />, label: 'Analytics', path: '/org/analytics' },
      { icon: <Coins size={20} />, label: 'Buy Tokens', path: '/tokens/buy' },
      { icon: <CheckSquare size={20} />, label: 'Tasks', path: '/tasks' },
      settingsItem,
    ]
  }

  // Platform Admin
  if (role === 'platform_admin') {
    return [
      ...base,
      { icon: <Building2 size={20} />, label: 'Organizations', path: '/admin/orgs' },
      { icon: <Users size={20} />, label: 'All Users', path: '/admin/users' },
      { icon: <Plus size={20} />, label: 'Create Account', path: '/admin/create-account' },
      { icon: <Coins size={20} />, label: 'Send Tokens', path: '/admin/send-tokens' },
      { icon: <Bot size={20} />, label: 'Model Pricing', path: '/admin/models' },
      { icon: <TrendingUp size={20} />, label: 'Revenue', path: '/admin/revenue' },
      { icon: <BarChart3 size={20} />, label: 'Analytics', path: '/admin/analytics' },
      settingsItem,
    ]
  }

  return [...base, settingsItem]
}

function SidebarBottomWidget({ role, hasOrg, collapsed }: { role: string; hasOrg: boolean; collapsed: boolean }) {
  const navigate = useNavigate()
  const { formattedBalance, tokenBalance } = useTokens()

  if (collapsed) return null

  // Employee — show allocated token balance (no buy button)
  if (hasOrg && role === 'employee') {
    return (
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--chat-border)' }}>
        <div style={{ background: 'var(--chat-bg)', borderRadius: '14px', padding: '12px', border: '1px solid var(--chat-border)' }}>
          <div className="flex items-center gap-2" style={{ marginBottom: '6px' }}>
            <Target size={14} style={{ color: tokenBalance < 1000 ? 'var(--color-warning)' : 'var(--color-accent-end)' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {formattedBalance} tokens
            </span>
          </div>
          <span style={{ fontSize: '10px', color: 'var(--color-text-dim)' }}>Allocated by manager</span>
        </div>
      </div>
    )
  }

  // Manager — show token balance (no buy button)
  if (hasOrg && role === 'manager') {
    return (
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--chat-border)' }}>
        <div style={{ background: 'var(--chat-bg)', borderRadius: '14px', padding: '12px', border: '1px solid var(--chat-border)' }}>
          <div className="flex items-center gap-2">
            <Users size={14} style={{ color: 'var(--color-accent-end)' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {formattedBalance} tokens
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Platform Admin
  if (role === 'platform_admin') {
    return (
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--chat-border)' }}>
        <div style={{ background: 'var(--chat-bg)', borderRadius: '14px', padding: '10px 12px', border: '1px solid var(--chat-border)' }}>
          <div className="flex items-center gap-2">
            <Shield size={14} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Platform Admin
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Default: Freelancer + Org Owner — token balance + buy button
  return (
    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--chat-border)' }}>
      <div style={{ background: 'var(--chat-bg)', borderRadius: '14px', padding: '12px', border: '1px solid var(--chat-border)' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: '8px' }}>
          <Zap size={14} style={{ color: 'var(--color-accent-end)' }} />
          <span style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-accent-end)' }}>
            {formattedBalance} tokens
          </span>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/tokens/buy')}
          className="w-full flex items-center justify-center gap-1.5"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))',
            color: 'white', fontSize: '12px', fontWeight: 600, padding: '7px 0',
            borderRadius: '10px', border: 'none', cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          Buy Tokens
        </motion.button>
      </div>
    </div>
  )
}

export function Sidebar({ collapsed, onToggle, onClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const role = user?.role || 'user'
  const hasOrg = !!user?.organizationId

  const navItems = getNavItems(role, hasOrg)

  return (
    <div
      className="h-screen flex flex-col transition-all duration-300"
      style={{
        width: collapsed ? '64px' : '240px',
        backgroundColor: 'var(--chat-sidebar-bg)', borderRight: '1px solid var(--chat-border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between shrink-0" style={{ padding: '0 14px', height: '52px', borderBottom: '1px solid var(--chat-border)' }}>
        <button
          onClick={() => { navigate('/dashboard'); onClose?.() }}
          className="flex items-center gap-2.5"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)' }}
        >
          <img src="/logo.png?v=2" alt="ConvoiaAI" style={{ height: collapsed ? '32px' : '40px', objectFit: 'contain', borderRadius: '8px' }} />
        </button>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onToggle}
          className="hidden lg:flex"
          style={{ padding: '6px', color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px' }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </motion.button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto" style={{ paddingTop: '10px' }}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 8px' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={cn(
                'group relative flex items-center gap-3 transition-all duration-200',
                collapsed && 'justify-center'
              )}
              style={({ isActive }) => ({
                padding: collapsed ? '8px' : '8px 12px',
                borderRadius: '10px', fontSize: '13px', fontWeight: 500,
                textDecoration: 'none',
                background: isActive ? 'var(--color-primary-light)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute"
                      style={{ left: 0, top: '50%', transform: 'translateY(-50%)', width: '3px', height: '20px', background: 'linear-gradient(to bottom, var(--color-primary), var(--color-primary-hover))', borderRadius: '2px' }}
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  <span style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-dim)', transition: 'color 150ms' }}>
                    {item.icon}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Bottom Widget */}
      <SidebarBottomWidget role={role} hasOrg={hasOrg} collapsed={collapsed} />

      {/* User */}
      <div className={cn('flex items-center gap-3', collapsed && 'justify-center')} style={{ padding: '10px 12px', borderTop: '1px solid var(--chat-border)' }}>
        {user && <Avatar name={user.name} src={user.avatar} size="sm" />}
        {!collapsed && user && (
          <div className="flex-1 min-w-0">
            <p className="truncate" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>{user.name}</p>
            <Badge size="sm" variant="primary">{(!hasOrg || role === 'user') ? 'individual' : user.role.replace('_', ' ')}</Badge>
          </div>
        )}
        {!collapsed && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={logout}
            style={{ padding: '6px', color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px' }}
          >
            <LogOut size={16} />
          </motion.button>
        )}
      </div>
    </div>
  )
}
