import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, MessageSquare, Coins, DollarSign, ArrowRight, Zap, Bot, Plus } from 'lucide-react'
import { StatCard } from '../../../components/shared/StatCard'
import { InsightCard } from '../../../components/shared/InsightCard'
import { Card } from '../../../components/ui/Card'
import { Tabs } from '../../../components/ui/Tabs'
import { Badge } from '../../../components/ui/Badge'
import { AreaChart } from '../../../components/charts/AreaChart'
import { DonutChart } from '../../../components/charts/DonutChart'
import { useWallet } from '../../../hooks/useWallet'
import { formatCurrency, formatNumber, formatTokens, formatDateTime, getGreeting, truncate } from '../../../lib/utils'
import type { DashboardStats, Wallet as WalletType, HourlySession, UsageLog, InsightData } from '../../../types'

interface PersonalViewProps {
  stats: DashboardStats
  wallet: WalletType | null
  sessions: HourlySession[]
  recentUsage: UsageLog[]
  insights: InsightData[]
  userName: string
}

export function PersonalView({ stats, wallet, sessions, recentUsage, insights, userName }: PersonalViewProps) {
  const navigate = useNavigate()
  const { setShowTopUp } = useWallet()
  const [chartMode, setChartMode] = useState('cost')

  const monthCost = Number(stats?.thisMonth?.cost ?? 0) || 0
  const monthQueries = Number(stats?.thisMonth?.queries ?? 0) || 0
  const monthTokens = Number(stats?.thisMonth?.tokens ?? 0) || 0
  const todayQueries = Number(stats?.today?.queries ?? 0) || 0
  const lastMonthCost = Number(stats?.lastMonth?.cost ?? 0) || 0
  const lastMonthQueries = Number(stats?.lastMonth?.queries ?? 0) || 0

  const dailyRate = monthCost / Math.max(new Date().getDate(), 1)
  const walletBalance = Number(wallet?.balance ?? 0) || 0
  const walletSpent = Number(wallet?.totalSpent ?? 0) || 0
  const daysRemaining = walletBalance > 0 && dailyRate > 0 ? Math.floor(walletBalance / dailyRate) : null
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const projectedEOM = dailyRate * daysInMonth

  const costTrend = lastMonthCost > 0 ? ((monthCost - lastMonthCost) / lastMonthCost) * 100 : 0
  const queryTrend = lastMonthQueries > 0 ? ((monthQueries - lastMonthQueries) / lastMonthQueries) * 100 : 0

  const modelBreakdown = (stats?.topModels ?? []).map((m) => ({ name: m.name, value: Number(m.cost ?? 0) || 0 }))

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-semibold text-text-primary">
          {getGreeting()}, {userName.split(' ')[0]}
        </h2>
        <p className="text-sm text-text-muted mt-1">Your personal AI workspace</p>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Wallet Balance"
          value={formatCurrency(walletBalance)}
          subtitle={daysRemaining !== null ? `~${daysRemaining} days remaining` : 'Top up to get started'}
          icon={<Wallet size={20} />}
          className={walletBalance < 1 ? 'border-red-500/30' : 'border-emerald-500/20'}
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
          title="Amount Spent"
          value={formatCurrency(monthCost)}
          subtitle={projectedEOM > 0 ? `~${formatCurrency(projectedEOM)} projected EOM` : undefined}
          icon={<DollarSign size={20} />}
          trend={costTrend}
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
            <h3 className="text-sm font-medium text-text-secondary">Usage Over Time</h3>
            <Tabs
              tabs={[
                { id: 'cost', label: 'Cost' },
                { id: 'queries', label: 'Queries' },
              ]}
              activeTab={chartMode}
              onChange={setChartMode}
            />
          </div>
          <AreaChart
            data={stats?.dailyUsage ?? []}
            xKey="date"
            yKey={chartMode}
            color="#7C3AED"
            height={280}
            formatY={chartMode === 'cost' ? (v: number) => `$${v.toFixed(2)}` : undefined}
          />
        </Card>
        <Card className="lg:col-span-2" padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Model Breakdown</h3>
          {modelBreakdown.length > 0 ? (
            <DonutChart data={modelBreakdown} height={280} />
          ) : (
            <div className="flex items-center justify-center h-[280px] text-text-muted text-sm">No usage data</div>
          )}
        </Card>
      </div>

      {/* Bottom Row: Recent Queries + Wallet/Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Recent Queries */}
        <Card className="lg:col-span-3" padding="none">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-medium text-text-secondary">Recent Queries</h3>
            <button onClick={() => navigate('/usage?tab=history')} className="text-xs text-primary hover:text-primary-hover flex items-center gap-1">
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-border/50">
            {recentUsage.length === 0 ? (
              <div className="px-5 py-8 text-center text-text-muted text-sm">No recent queries</div>
            ) : (
              recentUsage.slice(0, 5).map((log) => (
                <div key={log.id} className="px-5 py-3 flex items-center gap-4 hover:bg-surface-2 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{truncate(log.prompt || '', 60)}</p>
                    <p className="text-xs text-text-muted">{log.model?.name || 'Unknown'} &middot; {log.createdAt ? formatDateTime(log.createdAt) : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono text-text-secondary">{formatTokens(log.totalTokens)} tokens</p>
                    <p className="text-xs font-mono text-primary">{formatCurrency(log.customerPrice)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Right Column: Wallet + Sessions */}
        <div className="lg:col-span-2 space-y-4">
          {/* Wallet Mini Card */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-secondary">Wallet</h3>
              <button onClick={() => navigate('/wallet')} className="text-xs text-primary hover:text-primary-hover">Details</button>
            </div>
            <p className="text-2xl font-semibold font-mono text-text-primary mb-1">
              {formatCurrency(walletBalance)}
            </p>
            <p className="text-xs text-text-muted mb-3">
              Total spent: {formatCurrency(walletSpent)}
            </p>
            <button
              onClick={() => setShowTopUp(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))',
                color: 'white', border: 'none', cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Top Up Wallet
            </button>
          </Card>

          {/* Active Sessions Card */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-secondary">Active Sessions</h3>
              <button onClick={() => navigate('/sessions')} className="text-xs text-primary hover:text-primary-hover">Manage</button>
            </div>
            {(sessions ?? []).length === 0 ? (
              <div className="text-center py-2">
                <Zap size={24} className="mx-auto text-text-muted mb-2" />
                <p className="text-sm text-text-muted mb-1">No active sessions</p>
                <p className="text-xs text-text-muted mb-3">Purchase hourly access on Sessions page</p>
                <button
                  onClick={() => navigate('/sessions')}
                  className="text-xs font-medium text-primary hover:text-primary-hover"
                >
                  Buy Session
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.slice(0, 3).map((s) => (
                  <ActiveSessionRow key={s.id} session={s} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Quick Actions Row */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowTopUp(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)/20' }}
        >
          <Plus size={16} /> Top Up Wallet
        </button>
        <button
          onClick={() => navigate('/sessions')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)/20' }}
        >
          <Zap size={16} /> Buy Session
        </button>
        <button
          onClick={() => navigate('/models')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)/20' }}
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
  const barColor = pct > 95 ? '#EF4444' : pct > 80 ? '#F59E0B' : '#10B981'

  return (
    <div className="bg-surface-2 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-text-primary">{session.model?.name || 'Session'}</p>
        <Badge variant="success" size="sm">Active</Badge>
      </div>
      <p className="text-xs font-mono text-primary mb-2">{timeLeft}</p>
      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
    </div>
  )
}
