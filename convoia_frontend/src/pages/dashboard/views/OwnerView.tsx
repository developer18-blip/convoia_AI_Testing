import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, Users, Zap, Shield, ArrowRight, CreditCard, BarChart3, CheckSquare, UserPlus } from 'lucide-react'
import { StatCard } from '../../../components/shared/StatCard'
import { Card } from '../../../components/ui/Card'
import { Avatar } from '../../../components/ui/Avatar'
import { Badge } from '../../../components/ui/Badge'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { AreaChart } from '../../../components/charts/AreaChart'
import { formatCurrency, formatNumber, formatTokens, getGreeting } from '../../../lib/utils'
import api from '../../../lib/api'
import type { DashboardStats } from '../../../types'

interface OrgMember {
  id: string
  name: string
  email?: string
  role: string
  queries: number
  cost: number
}

interface TokenPoolData {
  totalTokens: number
  allocatedTokens: number
  usedTokens: number
  availableTokens: number
}

interface OwnerViewProps {
  stats: DashboardStats
  userName: string
  orgName: string
  plan: string
}

interface SubscriptionData {
  plan: string
  status: string
  monthlyTokenQuota: number
  tokensUsedThisMonth: number
  tokensRemaining: number
  percentUsed: number
  renewalDate: string | null
  planPrice: number
  planName: string
}

export function OwnerView({ stats, userName, orgName, plan }: OwnerViewProps) {
  const navigate = useNavigate()
  const [members, setMembers] = useState<OrgMember[]>([])
  const [tokenPool, setTokenPool] = useState<TokenPoolData | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      api.get('/org/team'),
      api.get('/tokens/pool'),
      api.get('/stripe/subscription'),
    ]).then(([membersRes, poolRes, subRes]) => {
      if (membersRes.status === 'fulfilled') setMembers(membersRes.value.data?.data || [])
      if (poolRes.status === 'fulfilled') setTokenPool(poolRes.value.data?.data || null)
      if (subRes.status === 'fulfilled') setSubscription(subRes.value.data?.data || null)
    }).finally(() => setIsLoading(false))
  }, [])

  const totalSpend = Number(stats?.thisMonth?.cost ?? 0) || 0
  const totalQueries = Number(stats?.thisMonth?.queries ?? 0) || 0
  const lastMonthCost = Number(stats?.lastMonth?.cost ?? 0) || 0
  const costTrend = lastMonthCost > 0 ? ((totalSpend - lastMonthCost) / lastMonthCost) * 100 : 0
  const activeMembers = members.length

  const poolTotal = tokenPool?.totalTokens || 0
  const poolUsed = tokenPool?.usedTokens || 0
  const poolAvailable = tokenPool?.availableTokens || 0
  const poolPct = poolTotal > 0 ? Math.round((poolUsed / poolTotal) * 100) : 0

  // Subscription info — prefer dynamic data from API
  const planLabel = subscription?.planName || plan || 'Free'
  const subStatus = subscription?.status === 'active' ? 'Active' : subscription?.status || 'Inactive'
  const subColor = planLabel.toLowerCase() === 'free' ? 'border-amber-500/30' : 'border-emerald-500/20'

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-semibold text-text-primary">
          {getGreeting()}, {userName.split(' ')[0]}
        </h2>
        <p className="text-sm text-text-muted mt-1">
          {orgName} <Badge size="sm" variant="primary">Owner</Badge> <Badge size="sm">{planLabel} Plan</Badge>
        </p>
      </div>

      {/* 4 Stat Cards — MONEY SHOWN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Org Spend"
          value={formatCurrency(totalSpend)}
          subtitle="this month"
          icon={<DollarSign size={20} />}
          trend={costTrend}
        />
        <StatCard
          title="Team Members"
          value={`${activeMembers}`}
          subtitle={`${activeMembers} active`}
          icon={<Users size={20} />}
        />
        <StatCard
          title="Token Pool"
          value={poolTotal > 0 ? `${formatTokens(poolUsed)} / ${formatTokens(poolTotal)}` : 'Not set'}
          subtitle={poolTotal > 0 ? `${poolPct}% used` : undefined}
          icon={<Zap size={20} />}
        />
        <StatCard
          title="Subscription"
          value={planLabel}
          subtitle={subStatus}
          icon={<Shield size={20} />}
          className={subColor}
        />
      </div>

      {/* Token Pool Section (prominent) */}
      {poolTotal > 0 && (
        <div
          style={{
            backgroundColor: '#111118',
            border: '1px solid #1E1E2E',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-secondary">Organization Token Pool</h3>
            <button onClick={() => navigate('/tokens')} className="text-xs text-primary hover:text-primary-hover flex items-center gap-1">
              Manage Allocation <ArrowRight size={12} />
            </button>
          </div>

          <ProgressBar value={poolUsed} max={poolTotal} size="lg" />

          <div className="grid grid-cols-3 gap-4 mt-4 text-center">
            <div>
              <p className="text-lg font-semibold font-mono text-text-primary">{formatTokens(poolUsed)}</p>
              <p className="text-[10px] text-text-muted mt-1">Used</p>
            </div>
            <div>
              <p className="text-lg font-semibold font-mono text-amber-400">{formatTokens(tokenPool?.allocatedTokens || 0)}</p>
              <p className="text-[10px] text-text-muted mt-1">Allocated</p>
            </div>
            <div>
              <p className="text-lg font-semibold font-mono text-emerald-400">{formatTokens(poolAvailable)}</p>
              <p className="text-[10px] text-text-muted mt-1">Available</p>
            </div>
          </div>
        </div>
      )}

      {/* Team Overview (top members) — SHOWS MONEY */}
      <Card padding="none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-medium text-text-secondary">Top Members by Usage</h3>
          <button onClick={() => navigate('/team')} className="text-xs text-primary hover:text-primary-hover flex items-center gap-1">
            View Full Team <ArrowRight size={12} />
          </button>
        </div>
        <div className="divide-y divide-border/50">
          {isLoading ? (
            <div className="space-y-1 animate-pulse p-5">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-surface-2 rounded" />)}
            </div>
          ) : members.length === 0 ? (
            <div className="px-5 py-8 text-center text-text-muted text-sm">No members found</div>
          ) : (
            [...members]
              .sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0))
              .slice(0, 5)
              .map((m, i) => (
                <div key={m.id} onClick={() => navigate(`/team/${m.id}`)} className="px-5 py-3 flex items-center gap-4 hover:bg-surface-2 transition-colors cursor-pointer">
                  <span className="text-sm font-mono text-text-muted w-6">#{i + 1}</span>
                  <Avatar name={m.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{m.name}</p>
                    <Badge size="sm">{m.role?.replace('_', ' ')}</Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-text-primary">{formatTokens(Number(m.queries) || 0)} queries</p>
                    <p className="text-xs font-mono text-primary">{formatCurrency(Number(m.cost) || 0)}</p>
                  </div>
                </div>
              ))
          )}
        </div>
      </Card>

      {/* Billing Card + 30-day spend chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Billing Card */}
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-secondary">Billing</h3>
            <button onClick={() => navigate('/org/billing')} className="text-xs text-primary hover:text-primary-hover">
              Manage
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Current Plan</span>
              <Badge size="sm" variant="primary">{planLabel}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">This Month</span>
              <span className="text-sm font-mono text-text-primary">{formatCurrency(totalSpend)}</span>
            </div>
            {subscription && subscription.monthlyTokenQuota > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-muted">Tokens</span>
                  <span className="text-xs font-mono text-text-muted">{subscription.percentUsed}%</span>
                </div>
                <ProgressBar value={subscription.tokensUsedThisMonth} max={subscription.monthlyTokenQuota} size="sm" />
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Total Queries</span>
              <span className="text-sm font-mono text-text-primary">{formatNumber(totalQueries)}</span>
            </div>
          </div>
          <button
            onClick={() => navigate(planLabel === 'Free' ? '/org/billing' : '/org/billing')}
            className="mt-4 w-full py-2 rounded-lg text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
            style={{ border: '1px solid var(--color-primary)', background: 'transparent', cursor: 'pointer' }}
          >
            {planLabel === 'Free' ? 'Upgrade Plan' : 'Manage Billing'}
          </button>
        </Card>

        {/* 30-Day Spend Chart */}
        <Card className="lg:col-span-2" padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">30-Day Organization Spend</h3>
          <AreaChart
            data={stats?.dailyUsage ?? []}
            xKey="date"
            yKey="cost"
            height={220}
            formatY={(v: number) => `$${v.toFixed(2)}`}
          />
        </Card>
      </div>

      {/* Quick Actions Row */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate('/team')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)/20' }}
        >
          <UserPlus size={16} /> Invite Member
        </button>
        <button
          onClick={() => navigate('/org/analytics')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)/20' }}
        >
          <BarChart3 size={16} /> View Analytics
        </button>
        <button
          onClick={() => navigate('/org/billing')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)/20' }}
        >
          <CreditCard size={16} /> Manage Billing
        </button>
        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)/20' }}
        >
          <CheckSquare size={16} /> Create Task
        </button>
      </div>
    </div>
  )
}
