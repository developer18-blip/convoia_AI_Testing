import { useAuth } from '../../hooks/useAuth'
import { useTokens } from '../../contexts/TokenContext'
import { useDashboard } from '../../hooks/useDashboard'
import { Zap, MessageSquare, Coins, Clock } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'

export function MobileHomePage() {
  const { user } = useAuth()
  const { tokenBalance, formattedBalance, totalUsed } = useTokens()
  const { stats, isLoading } = useDashboard()

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
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Greeting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: '14px', color: 'var(--color-primary)', fontWeight: 500, margin: 0 }}>{greeting},</p>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '2px 0 0', letterSpacing: '-0.5px' }}>{firstName}</h1>
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
          Available tokens
        </p>
        <p style={{ fontSize: '40px', fontWeight: 800, margin: '0 0 6px', letterSpacing: '-1px', lineHeight: 1 }}>
          {tokenBalance.toLocaleString()}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
            {totalUsed > 0 ? `${(totalUsed).toLocaleString()} used total` : 'Ready to use'}
          </p>
          <button onClick={() => window.location.href = '/tokens/buy'}
            style={{ padding: '6px 16px', borderRadius: '20px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
            Buy more →
          </button>
        </div>
      </div>

      {/* This Week Stats */}
      <div>
        <h2 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>This week</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <StatCard icon={<MessageSquare size={20} />} iconColor="#7C3AED" iconBg="rgba(124,58,237,0.1)" value={stats?.thisWeek?.queries?.toString() || '0'} label="Conversations" />
          <StatCard icon={<Zap size={20} />} iconColor="#F59E0B" iconBg="rgba(245,158,11,0.1)" value={formattedBalance} label="Tokens used" sub={`avg ${Math.round((stats?.thisWeek?.tokens || 0) / 7).toLocaleString()}/day`} />
          <StatCard icon={<Coins size={20} />} iconColor="#10B981" iconBg="rgba(16,185,129,0.1)" value={stats?.topModels?.[0]?.name?.split(' ')[0] || '—'} label="Top model" />
          <StatCard icon={<Clock size={20} />} iconColor="#EF4444" iconBg="rgba(239,68,68,0.1)" value={stats?.thisWeek?.cost ? `$${stats.thisWeek.cost.toFixed(2)}` : '$0'} label="Total cost" />
        </div>
      </div>

      {/* Recent Activity */}
      {stats?.dailyUsage && stats.dailyUsage.length > 0 && (
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>Recent activity</h2>
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

function StatCard({ icon, iconColor, iconBg, value, label, sub }: { icon: React.ReactNode; iconColor: string; iconBg: string; value: string; label: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--color-surface)', borderRadius: '16px', padding: '16px',
      border: '1px solid var(--color-border)',
    }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
        {icon}
      </div>
      <p style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.5px' }}>{value}</p>
      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{label}</p>
      {sub && <p style={{ fontSize: '11px', color: 'var(--color-primary)', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )
}

export default MobileHomePage
