import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTokens } from '../../contexts/TokenContext'
import { useDashboard } from '../../hooks/useDashboard'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import {
  Zap, MessageSquare, Coins, Clock, Users, Building2,
  TrendingUp, ChevronRight, Shield, BarChart3, DollarSign,
  ArrowUpRight, Sparkles, Wallet,
} from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'

interface DailyUsage {
  date: string
  queries: number
  tokens?: number
}

export function MobileHomePage() {
  const { user } = useAuth()
  const { tokenBalance, totalUsed, refresh: refreshTokens } = useTokens()
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
  const tokenText = compactNumber(tokenBalance ?? 0)
  const totalUsedText = compactNumber(totalUsed ?? 0)
  const weekCost = Number(stats?.thisWeek?.cost) || 0
  const monthCost = Number(stats?.thisMonth?.cost) || 0
  const totalSpent = Number(wallet?.totalSpent) || 0

  if (isLoading) {
    return (
      <div className="mobile-page" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="mobile-card" style={{ height: i === 1 ? 148 : 92, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    )
  }

  return (
    <div {...pullProps} className="mobile-page" style={{ display: 'flex', flexDirection: 'column', gap: 18, overscrollBehavior: 'none' }}>
      {isRefreshing && (
        <div style={{ textAlign: 'center', padding: '4px 0', fontSize: 12, color: 'var(--color-primary)', fontWeight: 700 }}>
          Refreshing...
        </div>
      )}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 15, color: 'var(--color-primary)', fontWeight: 800, margin: 0 }}>{greeting}</p>
          <h1 style={{ fontSize: 34, fontWeight: 900, color: 'var(--color-text-primary)', margin: '2px 0 8px', letterSpacing: 0, lineHeight: 1.02 }}>
            {firstName}
          </h1>
          <span style={roleBadgeStyle(isAdmin, isOwner, isManager, hasOrg)}>
            {isAdmin ? 'Platform Admin' : isOwner ? 'Org Owner' : isManager ? 'Manager' : hasOrg ? 'Employee' : 'Personal'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          style={{ border: 'none', background: 'transparent', padding: 0, flexShrink: 0 }}
          aria-label="Open profile"
        >
          <Avatar name={user?.name || 'User'} src={user?.avatar} size="md" />
        </button>
      </section>

      <section style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, var(--color-primary-hover) 0%, var(--color-primary) 52%, var(--color-primary-hover) 100%)',
        borderRadius: 26,
        padding: 22,
        color: 'white',
        boxShadow: '0 18px 44px rgba(109, 40, 217, 0.30)',
      }}>
        <div style={{
          position: 'absolute', right: -42, top: -48, width: 150, height: 150, borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.8, margin: 0 }}>
                {isEmployee ? 'Token budget' : 'Available tokens'}
              </p>
              <p style={{ fontSize: tokenText.length > 8 ? 40 : 46, fontWeight: 900, margin: '10px 0 0', letterSpacing: 0, lineHeight: 0.95 }}>
                {tokenText}
              </p>
            </div>
            <div style={{ width: 42, height: 42, borderRadius: 15, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginTop: 22 }}>
            <p style={{ fontSize: 13, opacity: 0.78, margin: 0 }}>
              {(totalUsed ?? 0) > 0 ? `${totalUsedText} used total` : 'Ready to create'}
            </p>
            {!isEmployee && (
              <button onClick={() => navigate('/tokens/buy')} style={heroButton}>
                Buy <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <MiniMetric label="Week cost" value={`$${weekCost.toFixed(2)}`} icon={<Clock size={15} />} color="#F59E0B" />
        <MiniMetric label="Queries" value={String(stats?.thisWeek?.queries || 0)} icon={<MessageSquare size={15} />} color="#3B82F6" />
        <MiniMetric label="Top" value={stats?.topModels?.[0]?.name?.split(' ')[0] || '-'} icon={<Zap size={15} />} color="#10B981" />
      </div>

      {isEmployee && budget && (
        <BudgetCard current={Number(budget.currentUsage) || 0} limit={Number(budget.monthlyCap) || 0} />
      )}

      {(isManager || isOwner || isAdmin) && (
        <section>
          <h2 className="mobile-section-title">{isAdmin ? 'Admin panel' : 'Quick actions'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {isAdmin ? (
              <>
                <QuickAction icon={<Building2 size={19} />} label="Organizations" sub="Manage orgs" color="var(--color-primary)" onClick={() => navigate('/admin/orgs')} />
                <QuickAction icon={<Users size={19} />} label="Users" sub="All users" color="#2563EB" onClick={() => navigate('/admin/users')} />
                <QuickAction icon={<DollarSign size={19} />} label="Revenue" sub="Platform revenue" color="#10B981" onClick={() => navigate('/admin/revenue')} />
                <QuickAction icon={<BarChart3 size={19} />} label="Analytics" sub="Full report" color="#F59E0B" onClick={() => navigate('/admin/analytics')} />
                <QuickAction icon={<Shield size={19} />} label="Models" sub="AI config" color="#EF4444" onClick={() => navigate('/admin/models')} />
                <QuickAction icon={<Coins size={19} />} label="Send tokens" sub="Grant tokens" color="var(--color-primary)" onClick={() => navigate('/admin/send-tokens')} />
              </>
            ) : (
              <>
                <QuickAction icon={<Users size={19} />} label="Team" sub="Members" color="var(--color-primary)" onClick={() => navigate('/team')} />
                {isOwner && <QuickAction icon={<Building2 size={19} />} label="Organization" sub="Settings" color="#2563EB" onClick={() => navigate('/org')} />}
                {isOwner && <QuickAction icon={<Wallet size={19} />} label="Billing" sub="Payments" color="#10B981" onClick={() => navigate('/tokens/buy')} />}
                <QuickAction icon={<BarChart3 size={19} />} label="Analytics" sub={isOwner ? 'Org report' : 'Usage'} color="#F59E0B" onClick={() => navigate(isOwner ? '/org/analytics' : '/usage')} />
              </>
            )}
          </div>
        </section>
      )}

      {(isOwner || isAdmin) && (
        <section>
          <h2 className="mobile-section-title">Financial overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <StatCard icon={<DollarSign size={19} />} iconColor="#10B981" iconBg="rgba(16,185,129,0.11)" value={`$${monthCost.toFixed(2)}`} label="This month" />
            <StatCard icon={<TrendingUp size={19} />} iconColor="var(--color-primary)" iconBg="var(--color-primary-glow)" value={`$${totalSpent.toFixed(2)}`} label="Total spent" />
          </div>
        </section>
      )}

      <section>
        <h2 className="mobile-section-title">This week</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <StatCard icon={<MessageSquare size={19} />} iconColor="var(--color-primary)" iconBg="var(--color-primary-glow)" value={String(stats?.thisWeek?.queries || 0)} label="Queries" />
          <StatCard icon={<Zap size={19} />} iconColor="#F59E0B" iconBg="rgba(245,158,11,0.12)" value={String(stats?.allTime?.queries || 0)} label="All time" />
          <StatCard icon={<Coins size={19} />} iconColor="#10B981" iconBg="rgba(16,185,129,0.11)" value={stats?.topModels?.[0]?.name?.split(' ')[0] || '-'} label="Top model" />
          <StatCard icon={<Clock size={19} />} iconColor="#EF4444" iconBg="rgba(239,68,68,0.10)" value={`$${weekCost.toFixed(2)}`} label="Week cost" />
        </div>
      </section>

      {stats?.dailyUsage && stats.dailyUsage.length > 0 && (
        <section>
          <h2 className="mobile-section-title">Recent activity</h2>
          <div className="mobile-card" style={{ overflow: 'hidden' }}>
            {(stats.dailyUsage as DailyUsage[]).slice(-5).reverse().map((day, i) => (
              <div key={`${day.date}-${i}`} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px',
                borderBottom: i < 4 ? '1px solid var(--color-border)' : 'none',
              }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{day.queries} queries</p>
                </div>
                <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                  {day.tokens?.toLocaleString() || '-'} tokens
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const heroButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '9px 14px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.20)',
  border: '1px solid rgba(255,255,255,0.34)',
  color: 'white',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
}

function roleBadgeStyle(isAdmin: boolean, isOwner: boolean, isManager: boolean, hasOrg: boolean): CSSProperties {
  const color = isAdmin ? '#EF4444' : isOwner ? 'var(--color-primary)' : isManager ? '#10B981' : hasOrg ? '#2563EB' : '#64748B'
  return {
    display: 'inline-flex',
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    background: `${color}14`,
    color,
  }
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2).replace(/\.0+$/, '')}M`
  if (value >= 1_000) return value.toLocaleString()
  return String(value)
}

function MiniMetric({ icon, label, value, color }: { icon: ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="mobile-card" style={{ padding: '12px 10px' }}>
      <div style={{ width: 28, height: 28, borderRadius: 10, background: `${color}13`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        {icon}
      </div>
      <p style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 15, lineHeight: 1.1, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 10, fontWeight: 700 }}>{label}</p>
    </div>
  )
}

function BudgetCard({ current, limit }: { current: number; limit: number }) {
  const pct = limit > 0 ? (current / limit) * 100 : 0
  const color = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981'

  return (
    <section className="mobile-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 900, color: 'var(--color-text-primary)', margin: 0 }}>Budget status</h2>
        <span style={{ fontSize: 12, fontWeight: 900, color }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 9, borderRadius: 999, background: 'var(--color-surface-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 999, transition: 'width 500ms' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 9, fontWeight: 700 }}>
        <span>{current.toLocaleString()} used</span>
        <span>{limit.toLocaleString()} limit</span>
      </div>
    </section>
  )
}

function StatCard({ icon, iconColor, iconBg, value, label }: { icon: ReactNode; iconColor: string; iconBg: string; value: string; label: string }) {
  return (
    <div className="mobile-card" style={{ padding: 16, minHeight: 126 }}>
      <div style={{ width: 40, height: 40, borderRadius: 14, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        {icon}
      </div>
      <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-text-primary)', margin: 0, letterSpacing: 0, lineHeight: 1.05 }}>{value}</p>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0', fontWeight: 700 }}>{label}</p>
    </div>
  )
}

function QuickAction({ icon, label, sub, color, onClick }: { icon: ReactNode; label: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mobile-card" style={{
      minHeight: 104,
      padding: 14,
      border: '1px solid var(--color-primary-light)',
      cursor: 'pointer',
      textAlign: 'left',
      display: 'flex',
      alignItems: 'center',
      gap: 11,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 14, background: `${color}13`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--color-text-primary)', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 0', lineHeight: 1.25, fontWeight: 700 }}>{sub}</p>
      </div>
      <ChevronRight size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
    </button>
  )
}

export default MobileHomePage
