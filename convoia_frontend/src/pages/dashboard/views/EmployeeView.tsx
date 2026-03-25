import { useNavigate } from 'react-router-dom'
import { MessageSquare, Zap, Shield, Target, CheckSquare } from 'lucide-react'
import { StatCard } from '../../../components/shared/StatCard'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { formatNumber, formatTokens, formatDateTime, getGreeting, truncate } from '../../../lib/utils'
import type { DashboardStats, UsageLog, InsightData, Budget } from '../../../types'

interface EmployeeViewProps {
  stats: DashboardStats
  recentUsage: UsageLog[]
  insights: InsightData[]
  userName: string
  orgName: string
  budget?: Budget | null
}

export function EmployeeView({ stats, recentUsage, userName, orgName, budget }: EmployeeViewProps) {
  const navigate = useNavigate()

  const monthQueries = Number(stats?.thisMonth?.queries ?? 0) || 0
  const monthTokens = Number(stats?.thisMonth?.tokens ?? 0) || 0
  const todayQueries = Number(stats?.today?.queries ?? 0) || 0

  const currentUsage = Number(budget?.currentUsage ?? 0) || 0
  const monthlyCap = Number(budget?.monthlyCap ?? 0) || 0
  const hasBudget = budget && monthlyCap > 0
  const percentage = monthlyCap > 0 ? Math.round((currentUsage / monthlyCap) * 100) : 0
  const remainingTokens = Math.max(0, monthlyCap - currentUsage)

  const resetDate = budget?.resetDate ? new Date(budget.resetDate) : null
  const daysUntilReset = resetDate ? Math.max(0, Math.ceil((resetDate.getTime() - Date.now()) / 86400000)) : null

  // Budget health label
  let budgetHealthLabel = 'No budget set'
  let budgetHealthColor = ''
  if (hasBudget) {
    if (percentage < 80) {
      budgetHealthLabel = 'On track'
      budgetHealthColor = 'border-emerald-500/20'
    } else if (percentage < 95) {
      budgetHealthLabel = 'Approaching limit'
      budgetHealthColor = 'border-amber-500/30'
    } else {
      budgetHealthLabel = 'Near limit — contact manager'
      budgetHealthColor = 'border-red-500/30'
    }
  }

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
        <p className="text-sm mt-1 flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
          {orgName} <Badge size="sm" variant="primary">Employee</Badge>
        </p>
      </div>

      {/* 4 Stat Cards — NO MONEY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="My Token Budget"
          value={hasBudget ? `${formatTokens(currentUsage)} / ${formatTokens(monthlyCap)}` : 'Not set'}
          subtitle={daysUntilReset !== null ? `Resets in ${daysUntilReset} days` : undefined}
          icon={<Target size={20} />}
          className={hasBudget ? (percentage > 80 ? 'border-amber-500/30' : 'border-emerald-500/20') : ''}
        />
        <StatCard
          title="Queries This Month"
          value={formatNumber(monthQueries)}
          subtitle={`${todayQueries} today`}
          icon={<MessageSquare size={20} />}
        />
        <StatCard
          title="Tokens Used"
          value={formatTokens(monthTokens)}
          subtitle={hasBudget ? `of ${formatTokens(monthlyCap)} allocated` : 'this month'}
          icon={<Zap size={20} />}
        />
        <StatCard
          title="Budget Health"
          value={hasBudget ? `${percentage}% used` : 'N/A'}
          subtitle={budgetHealthLabel}
          icon={<Shield size={20} />}
          className={budgetHealthColor}
        />
      </div>

      {/* Budget Progress Card (prominent) */}
      {hasBudget && (
        <div
          style={{
            background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)',
            border: '1px solid var(--color-border)',
            borderTop: '3px solid var(--color-accent-start)',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-secondary)' }}>Token Budget Status</h3>

          {/* Large progress bar */}
          <ProgressBar value={currentUsage} max={monthlyCap} size="lg" />
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            {formatTokens(currentUsage)} / {formatTokens(monthlyCap)} tokens used ({percentage}%)
          </p>

          <div className="flex items-center justify-between mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span>Remaining: {formatTokens(remainingTokens)} tokens</span>
            <span>Resets: {resetDate ? resetDate.toLocaleDateString() : '-'}</span>
          </div>

          {/* Warning banners */}
          {percentage >= 95 && (
            <div
              className="mt-4 px-4 py-3 rounded-lg"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <p className="text-xs font-medium" style={{ color: 'var(--color-danger)' }}>
                You're almost at your limit! Queries may be restricted soon. Contact your manager immediately.
              </p>
            </div>
          )}
          {percentage >= 80 && percentage < 95 && (
            <div
              className="mt-4 px-4 py-3 rounded-lg"
              style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
            >
              <p className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
                You've used {percentage}% of your monthly budget. Contact your manager if you need more.
              </p>
            </div>
          )}
        </div>
      )}

      {/* No budget state */}
      {!hasBudget && (
        <Card padding="lg">
          <div className="text-center py-6">
            <Target size={32} className="mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No budget assigned yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Contact your manager to get a token budget assigned.</p>
          </div>
        </Card>
      )}

      {/* Recent Queries — NO COST COLUMN, tokens only */}
      <Card padding="none">
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Recent Queries</h3>
          <button
            onClick={() => navigate('/usage')}
            className="text-xs transition-colors"
            style={{ color: 'var(--color-primary)' }}
          >
            View all
          </button>
        </div>
        <div>
          {recentUsage.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>No recent queries</div>
          ) : (
            recentUsage.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="px-5 py-3 flex items-center gap-4 transition-colors"
                style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{truncate(log.prompt || '', 60)}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {log.model?.name || 'Unknown'} &middot; {log.createdAt ? formatDateTime(log.createdAt) : ''}
                  </p>
                </div>
                {/* NO COST — only tokens */}
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>{formatTokens(log.totalTokens)} tokens</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* My Tasks Card */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>My Tasks</h3>
          <button
            onClick={() => navigate('/tasks')}
            className="text-xs transition-colors"
            style={{ color: 'var(--color-primary)' }}
          >
            View all
          </button>
        </div>
        <div className="text-center py-4">
          <CheckSquare size={24} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Tasks from your manager will appear here</p>
        </div>
      </Card>
    </div>
  )
}
