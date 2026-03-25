import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Coins, ArrowRight, Zap, Bot, Plus } from 'lucide-react'
import { StatCard } from '../../../components/shared/StatCard'
import { InsightCard } from '../../../components/shared/InsightCard'
import { Card } from '../../../components/ui/Card'
import { Tabs } from '../../../components/ui/Tabs'
import { Badge } from '../../../components/ui/Badge'
import { AreaChart } from '../../../components/charts/AreaChart'
import { DonutChart } from '../../../components/charts/DonutChart'
import { useTokens } from '../../../contexts/TokenContext'
import { formatNumber, formatTokens, formatDateTime, getGreeting, truncate } from '../../../lib/utils'
import type { DashboardStats, HourlySession, UsageLog, InsightData } from '../../../types'

interface PersonalViewProps {
  stats: DashboardStats
  wallet: any
  sessions: HourlySession[]
  recentUsage: UsageLog[]
  insights: InsightData[]
  userName: string
}

export function PersonalView({ stats, wallet: _wallet, sessions, recentUsage, insights, userName }: PersonalViewProps) {
  const navigate = useNavigate()
  const { tokenBalance, formattedBalance, totalPurchased, totalUsed } = useTokens()
  const [chartMode, setChartMode] = useState('queries')

  const monthQueries = Number(stats?.thisMonth?.queries ?? 0) || 0
  const monthTokens = Number(stats?.thisMonth?.tokens ?? 0) || 0
  const todayQueries = Number(stats?.today?.queries ?? 0) || 0
  const lastMonthQueries = Number(stats?.lastMonth?.queries ?? 0) || 0
  const queryTrend = lastMonthQueries > 0 ? ((monthQueries - lastMonthQueries) / lastMonthQueries) * 100 : 0

  const modelBreakdown = (stats?.topModels ?? []).map((m) => ({ name: m.name, value: Number(m.cost ?? 0) || 0 }))

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)',
          border: '1px solid var(--color-border)',
          borderLeft: '4px solid var(--color-accent-start)',
          borderRadius: '12px',
          padding: '20px 24px',
        }}
      >
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {getGreeting()}, {userName.split(' ')[0]}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Your personal AI workspace</p>
      </div>

      {/* 4 Stat Cards — Token-based */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Token Balance"
          value={formattedBalance}
          subtitle={tokenBalance > 0 ? 'Available to use' : 'Buy tokens to get started'}
          icon={<Zap size={20} />}
          className={tokenBalance < 1000 ? 'border-red-500/30' : 'border-emerald-500/20'}
        />
        <StatCard
          title="Queries This Month"
          value={formatNumber(monthQueries)}
          subtitle={`${todayQueries} today`}
          icon={<MessageSquare size={20} />}
          trend={queryTrend}
        />
        <StatCard
          title="Tokens Used"
          value={formatTokens(monthTokens)}
          subtitle="this month"
          icon={<Coins size={20} />}
        />
        <StatCard
          title="Total Purchased"
          value={formatTokens(totalPurchased)}
          subtitle={`${formatTokens(totalUsed)} used overall`}
          icon={<Coins size={20} />}
        />
      </div>

      {/* Smart Insights Row */}
      {insights.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      )}

      {/* Charts Row: Usage + Model Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3" padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Usage Over Time</h3>
            <Tabs
              tabs={[
                { id: 'queries', label: 'Queries' },
                { id: 'cost', label: 'Cost' },
              ]}
              activeTab={chartMode}
              onChange={setChartMode}
            />
          </div>
          <AreaChart
            data={stats?.dailyUsage ?? []}
            xKey="date"
            yKey={chartMode}
            color="var(--color-accent-start)"
            height={280}
            formatY={chartMode === 'cost' ? (v: number) => `$${v.toFixed(2)}` : undefined}
          />
        </Card>
        <Card className="lg:col-span-2" padding="lg">
          <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-secondary)' }}>Model Breakdown</h3>
          {modelBreakdown.length > 0 ? (
            <DonutChart data={modelBreakdown} height={280} />
          ) : (
            <div className="flex items-center justify-center h-[280px] text-sm" style={{ color: 'var(--color-text-muted)' }}>No usage data</div>
          )}
        </Card>
      </div>

      {/* Bottom Row: Recent Queries + Token Balance/Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Recent Queries */}
        <Card className="lg:col-span-3" padding="none">
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Recent Queries</h3>
            <button
              onClick={() => navigate('/usage?tab=history')}
              className="text-xs flex items-center gap-1 transition-colors"
              style={{ color: 'var(--color-primary)' }}
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div style={{ borderTop: 'none' }}>
            {recentUsage.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>No recent queries</div>
            ) : (
              recentUsage.slice(0, 5).map((log) => (
                <div
                  key={log.id}
                  className="px-5 py-3 flex items-center gap-4 transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{truncate(log.prompt || '', 60)}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{log.model?.name || 'Unknown'} &middot; {log.createdAt ? formatDateTime(log.createdAt) : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{formatTokens(log.totalTokens)} tokens</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Right Column: Token Balance + Sessions */}
        <div className="lg:col-span-2 space-y-4">
          {/* Token Balance Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)',
              border: '1px solid var(--color-border)',
              borderTop: '3px solid var(--color-accent-start)',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>My Tokens</h3>
            </div>
            <p className="text-2xl font-semibold font-mono mb-1" style={{ color: 'var(--color-primary)' }}>
              {formattedBalance}
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              {formatTokens(totalUsed)} used &middot; {formatTokens(totalPurchased)} purchased
            </p>
            <button
              onClick={() => navigate('/tokens/buy')}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-end))',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Buy Tokens
            </button>
          </div>

          {/* Active Sessions Card */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Active Sessions</h3>
              <button
                onClick={() => navigate('/sessions')}
                className="text-xs transition-colors"
                style={{ color: 'var(--color-primary)' }}
              >
                Manage
              </button>
            </div>
            {(sessions ?? []).length === 0 ? (
              <div className="text-center py-2">
                <Zap size={24} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>No active sessions</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Start a chat to begin</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.slice(0, 3).map((s) => (
                  <ActiveSessionRow key={s.id} session={s} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Row */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate('/tokens/buy')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-border)' }}
        >
          <Plus size={16} /> Buy Tokens
        </button>
        <button
          onClick={() => navigate('/chat')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-border)' }}
        >
          <MessageSquare size={16} /> Start Chat
        </button>
        <button
          onClick={() => navigate('/models')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-border)' }}
        >
          <Bot size={16} /> Browse Models
        </button>
      </div>
    </div>
  )
}

function ActiveSessionRow({ session }: { session: HourlySession }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const end = new Date(session.endTime).getTime()
      const now = Date.now()
      const diff = end - now
      if (diff <= 0) { setTimeLeft('Expired'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${h}h ${m}m ${s}s`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [session.endTime])

  const total = new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
  const elapsed = Date.now() - new Date(session.startTime).getTime()
  const pct = Math.min((elapsed / total) * 100, 100)

  // Bar uses CSS variables for the gradient, falls back to semantic color tokens for warning states
  const barStyle: React.CSSProperties =
    pct > 95
      ? { background: 'var(--color-danger)', width: `${pct}%` }
      : pct > 80
      ? { background: 'var(--color-warning)', width: `${pct}%` }
      : { background: 'linear-gradient(90deg, var(--color-accent-start), var(--color-accent-end))', width: `${pct}%` }

  return (
    <div
      style={{
        background: 'var(--color-surface-2)',
        borderRadius: '8px',
        padding: '12px',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{session.model?.name || 'Session'}</p>
        <Badge variant="success" size="sm">Active</Badge>
      </div>
      <p className="text-xs font-mono mb-2" style={{ color: 'var(--color-primary)' }}>{timeLeft}</p>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
        <div className="h-full rounded-full transition-all" style={barStyle} />
      </div>
    </div>
  )
}
