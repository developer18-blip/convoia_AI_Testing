import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTokens } from '../../contexts/TokenContext'
import { useDashboard } from '../../hooks/useDashboard'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import {
  Zap, MessageSquare, Coins, Clock, Users, Building2,
  TrendingUp, ChevronRight, Shield, BarChart3, DollarSign,
} from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'

export function MobileHomePage() {
  const { user } = useAuth()
  const { tokenBalance, formattedBalance, totalUsed, refresh: refreshTokens } = useTokens()
  const { stats, wallet, budget, isLoading, refetch } = useDashboard()
  const navigate = useNavigate()
  const { isRefreshing, pullProps } = usePullToRefresh(async () => { await refetch(); await refreshTokens() })

  const role = user?.role || 'employee'
  const hasOrg = !!user?.organizationId
  const isAdmin = role === 'platform_admin'
  const isOwner = role === 'org_owner'
  const isManager = role === 'manager'
  const isEmployee = hasOrg && !isOwner && !isManager && !isAdmin

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const firstName = user?.name?.split(' ')[0] || 'there'

  if (isLoading) {
    return (
      <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: '80px', borderRadius: '16px', background: 'var(--color-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    )
  }

  return (
    <div {...pullProps} style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Pull-to-refresh indicator */}
      {isRefreshing && (
        <div style={{ textAlign: 'center', padding: '4px 0', fontSize: '12px', color: 'var(--color-primary)', fontWeight: 600 }}>
          Refreshing...
        </div>
      )}
      {/* Greeting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: '14px', color: 'var(--color-primary)', fontWeight: 500, margin: 0 }}>{greeting},</p>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '2px 0 0', letterSpacing: '-0.5px' }}>{firstName}</h1>
          {/* Role badge */}
          <span style={{
            display: 'inline-block', marginTop: '6px', padding: '3px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            background: isAdmin ? 'rgba(239,68,68,0.1)' : isOwner ? 'rgba(124,58,237,0.1)' : isManager ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
            color: isAdmin ? '#EF4444' : isOwner ? '#7C3AED' : isManager ? '#10B981' : '#3B82F6',
          }}>
            {isAdmin ? 'Platform Admin' : isOwner ? 'Org Owner' : isManager ? 'Manager' : hasOrg ? 'Employee' : 'Personal'}
          </span>
        </div>
        <Avatar name={user?.name || 'User'} src={user?.avatar} size="md" />
      </div>

      {/* Token Balance Hero Card */}
      <div style={{
        background: 'linear-gradient(135deg, #7C3AED, #6D28D9, #5B21B6)',
        borderRadius: '20px', padding: '24px', color: 'white',
        boxShadow: '0 8px 32px rgba(124, 58, 237, 0.3)',
      }}>
        <p style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8, margin: '0 0 8px' }}>
          {isEmployee ? 'Your Token Budget' : 'Available Tokens'}
        </p>
        <p style={{ fontSize: '40px', fontWeight: 800, margin: '0 0 6px', letterSpacing: '-1px', lineHeight: 1 }}>
          {(tokenBalance ?? 0).toLocaleString()}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
            {(totalUsed ?? 0) > 0 ? `${(totalUsed ?? 0).toLocaleString()} used total` : 'Ready to use'}
          </p>
          {!isEmployee && (
            <button onClick={() => navigate('/tokens/buy')}
              style={{ padding: '6px 16px', borderRadius: '20px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
              Buy more →
            </button>
          )}
        </div>
      </div>

      {/* ─── EMPLOYEE: Budget Status ─── */}
      {isEmployee && budget && (
        (() => {
          const pct = budget.monthlyCap > 0 ? (budget.currentUsage / budget.monthlyCap) * 100 : 0
          return (
            <div style={{ background: 'var(--color-surface)', borderRadius: '16px', padding: '16px', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Budget Status</h3>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>
                  {Math.round(pct)}%
                </span>
              </div>
              {/* Progress bar */}
              <div style={{ height: '8px', borderRadius: '4px', background: 'var(--color-surface-2)', overflow: 'hidden', marginBottom: '10px' }}>
                <div style={{
                  height: '100%', borderRadius: '4px', transition: 'width 500ms',
                  width: `${Math.min(pct, 100)}%`,
                  background: pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                <span>{(Number(budget.currentUsage) || 0).toLocaleString()} used</span>
                <span>{(Number(budget.monthlyCap) || 0).toLocaleString()} limit</span>
              </div>
              {pct > 80 && (
                <p style={{ fontSize: '12px', color: '#F59E0B', fontWeight: 600, margin: '8px 0 0' }}>
                  ⚠ Running low — contact your manager for more tokens
                </p>
              )}
            </div>
          )
        })()
      )}

      {/* ─── MANAGER / ORG OWNER: Quick Actions ─── */}
      {(isManager || isOwner) && (
        <div>
          <h2 style={sectionTitle}>Quick Actions</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <QuickAction icon={<Users size={20} />} label="Team" sub="Manage members" color="#7C3AED" onClick={() => navigate('/team')} />
            {isOwner && <QuickAction icon={<Building2 size={20} />} label="Organization" sub="Settings & billing" color="#3B82F6" onClick={() => navigate('/org')} />}
            {isOwner && <QuickAction icon={<DollarSign size={20} />} label="Billing" sub="Payments & invoices" color="#10B981" onClick={() => navigate('/org/billing')} />}
            <QuickAction icon={<BarChart3 size={20} />} label="Analytics" sub={isOwner ? 'Org analytics' : 'Usage stats'} color="#F59E0B" onClick={() => navigate(isOwner ? '/org/analytics' : '/usage')} />
          </div>
        </div>
      )}

      {/* ─── PLATFORM ADMIN: Admin Quick Actions ─── */}
      {isAdmin && (
        <div>
          <h2 style={sectionTitle}>Admin Panel</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <QuickAction icon={<Building2 size={20} />} label="Organizations" sub="Manage orgs" color="#7C3AED" onClick={() => navigate('/admin/orgs')} />
            <QuickAction icon={<Users size={20} />} label="Users" sub="All users" color="#3B82F6" onClick={() => navigate('/admin/users')} />
            <QuickAction icon={<DollarSign size={20} />} label="Revenue" sub="Platform revenue" color="#10B981" onClick={() => navigate('/admin/revenue')} />
            <QuickAction icon={<BarChart3 size={20} />} label="Analytics" sub="Full analytics" color="#F59E0B" onClick={() => navigate('/admin/analytics')} />
            <QuickAction icon={<Shield size={20} />} label="Models" sub="AI model config" color="#EF4444" onClick={() => navigate('/admin/models')} />
            <QuickAction icon={<Coins size={20} />} label="Send Tokens" sub="Grant tokens" color="#8B5CF6" onClick={() => navigate('/admin/send-tokens')} />
          </div>
        </div>
      )}

      {/* ─── ORG OWNER / ADMIN: Financial Overview ─── */}
      {(isOwner || isAdmin) && (
        <div>
          <h2 style={sectionTitle}>Financial Overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <StatCard icon={<DollarSign size={20} />} iconColor="#10B981" iconBg="rgba(16,185,129,0.1)"
              value={`$${(Number(stats?.thisMonth?.cost) || 0).toFixed(2)}`} label="This month" />
            <StatCard icon={<TrendingUp size={20} />} iconColor="#7C3AED" iconBg="rgba(124,58,237,0.1)"
              value={`$${(Number(wallet?.totalSpent) || 0).toFixed(2)}`} label="Total spent" />
          </div>
        </div>
      )}

      {/* This Week Stats — ALL ROLES */}
      <div>
        <h2 style={sectionTitle}>This week</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <StatCard icon={<MessageSquare size={20} />} iconColor="#7C3AED" iconBg="rgba(124,58,237,0.1)" value={stats?.thisWeek?.queries?.toString() || '0'} label="This week" />
          <StatCard icon={<Zap size={20} />} iconColor="#F59E0B" iconBg="rgba(245,158,11,0.1)" value={stats?.allTime?.queries?.toString() || '0'} label="Total queries" />
          <StatCard icon={<Coins size={20} />} iconColor="#10B981" iconBg="rgba(16,185,129,0.1)" value={stats?.topModels?.[0]?.name?.split(' ')[0] || '—'} label="Top model" />
          <StatCard icon={<Clock size={20} />} iconColor="#EF4444" iconBg="rgba(239,68,68,0.1)" value={`$${(Number(stats?.thisWeek?.cost) || 0).toFixed(2)}`} label="Week cost" />
        </div>
      </div>

      {/* Recent Activity */}
      {stats?.dailyUsage && stats.dailyUsage.length > 0 && (
        <div>
          <h2 style={sectionTitle}>Recent activity</h2>
          <div style={{ background: 'var(--color-surface)', borderRadius: '16px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            {stats.dailyUsage.slice(-5).reverse().map((day: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px',
                borderBottom: i < 4 ? '1px solid var(--color-border)' : 'none',
              }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{day.queries} queries</p>
                </div>
                <span style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                  {day.tokens?.toLocaleString() || '—'} tokens
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const sectionTitle: React.CSSProperties = { fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', margin: '0 0 12px' }

function StatCard({ icon, iconColor, iconBg, value, label, sub }: { icon: React.ReactNode; iconColor: string; iconBg: string; value: string; label: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: '16px', padding: '16px', border: '1px solid var(--color-border)' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
        {icon}
      </div>
      <p style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.5px' }}>{value}</p>
      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{label}</p>
      {sub && <p style={{ fontSize: '11px', color: 'var(--color-primary)', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )
}

function QuickAction({ icon, label, sub, color, onClick }: { icon: React.ReactNode; label: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--color-surface)', borderRadius: '16px', padding: '16px', border: '1px solid var(--color-border)',
      cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>{label}</p>
        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{sub}</p>
      </div>
      <ChevronRight size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
    </button>
  )
}

export default MobileHomePage
