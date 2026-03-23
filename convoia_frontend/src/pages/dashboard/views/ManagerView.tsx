import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Users, Shield, CheckSquare, ArrowRight } from 'lucide-react'
import { StatCard } from '../../../components/shared/StatCard'
import { Card } from '../../../components/ui/Card'
import { Avatar } from '../../../components/ui/Avatar'
import { Badge } from '../../../components/ui/Badge'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { formatNumber, formatTokens, getGreeting } from '../../../lib/utils'
import api from '../../../lib/api'
import type { DashboardStats } from '../../../types'

interface TeamMember {
  id: string
  name: string
  email?: string
  avatar?: string | null
  role: string
  queries: number
  cost: number
  budgetUsed: number
  budgetCap: number
  lastActive: string
}

interface ManagerViewProps {
  stats: DashboardStats
  userName: string
  orgName: string
}

export function ManagerView({ stats, userName, orgName }: ManagerViewProps) {
  const navigate = useNavigate()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.get('/org/team')
      .then((res) => setMembers(res.data.data || []))
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  const totalQueries = members.reduce((s, m) => s + (Number(m.queries) || 0), 0) || (Number(stats?.thisMonth?.queries) || 0)
  const activeMembers = members.filter((m) => m.lastActive).length || members.length
  const totalMembers = members.length

  // Average budget % across team
  const membersWithBudget = members.filter((m) => (Number(m.budgetCap) || 0) > 0)
  const avgBudgetPct = membersWithBudget.length > 0
    ? membersWithBudget.reduce((s, m) => {
        const cap = Number(m.budgetCap) || 0
        const used = Number(m.budgetUsed) || 0
        return s + (cap > 0 ? (used / cap) * 100 : 0)
      }, 0) / membersWithBudget.length
    : 0

  const membersNearLimit = members.filter((m) => {
    const cap = Number(m.budgetCap) || 0
    return cap > 0 && (Number(m.budgetUsed) || 0) / cap > 0.8
  }).length

  const budgetSubtitle = membersNearLimit > 0
    ? `${membersNearLimit} member${membersNearLimit > 1 ? 's' : ''} near limit`
    : 'All on track'

  // Pending tasks placeholder
  const pendingTasks = 0
  const overdueTasks = 0

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-semibold text-text-primary">
          {getGreeting()}, {userName.split(' ')[0]}
        </h2>
        <p className="text-sm text-text-muted mt-1">
          {orgName} <Badge size="sm" variant="primary">Manager</Badge>
        </p>
      </div>

      {/* 4 Stat Cards — NO MONEY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Team Members"
          value={`${activeMembers} / ${totalMembers}`}
          subtitle={`${activeMembers} active`}
          icon={<Users size={20} />}
        />
        <StatCard
          title="Team Queries"
          value={formatNumber(totalQueries)}
          subtitle="this month"
          icon={<MessageSquare size={20} />}
        />
        <StatCard
          title="Budget Health"
          value={`${avgBudgetPct.toFixed(0)}% avg`}
          subtitle={budgetSubtitle}
          icon={<Shield size={20} />}
          className={membersNearLimit > 0 ? 'border-amber-500/30' : 'border-emerald-500/20'}
        />
        <StatCard
          title="Pending Tasks"
          value={String(pendingTasks)}
          subtitle={overdueTasks > 0 ? `${overdueTasks} overdue` : 'None overdue'}
          icon={<CheckSquare size={20} />}
        />
      </div>

      {/* Team Members Table (compact) — NO DOLLAR AMOUNTS */}
      <Card padding="none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-medium text-text-secondary">Team Members</h3>
          <button onClick={() => navigate('/team')} className="text-xs text-primary hover:text-primary-hover flex items-center gap-1">
            View full team <ArrowRight size={12} />
          </button>
        </div>

        {/* Table header */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2 text-[10px] font-semibold text-text-dim uppercase tracking-wider border-b border-border/50">
          <div className="col-span-4">Member</div>
          <div className="col-span-2 text-right">Tokens Used</div>
          <div className="col-span-3">Budget %</div>
          <div className="col-span-2 text-right">Queries</div>
          <div className="col-span-1 text-right">Status</div>
        </div>

        <div className="divide-y divide-border/50">
          {isLoading ? (
            <div className="space-y-1 animate-pulse p-5">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-surface-2 rounded" />)}
            </div>
          ) : members.length === 0 ? (
            <div className="px-5 py-8 text-center text-text-muted text-sm">No team members found</div>
          ) : (
            members.slice(0, 8).map((m) => {
              const cap = Number(m.budgetCap) || 0
              const used = Number(m.budgetUsed) || 0
              const pct = cap > 0 ? Math.round((used / cap) * 100) : 0
              const isNearLimit = pct > 80

              return (
                <div key={m.id} onClick={() => navigate(`/team/${m.id}`)} className="px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-surface-2 transition-colors cursor-pointer">
                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    <Avatar name={m.name} src={m.avatar} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{m.name}</p>
                      <p className="text-[10px] text-text-muted">{m.role?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-xs font-mono text-text-secondary">{formatTokens(used)}</p>
                  </div>
                  <div className="col-span-3">
                    {cap > 0 ? (
                      <div className="flex items-center gap-2">
                        <ProgressBar value={used} max={cap} size="sm" className="flex-1" />
                        <span className="text-[10px] font-mono text-text-muted w-8 text-right">{pct}%</span>
                        {isNearLimit && <span className="text-amber-400 text-xs">!</span>}
                      </div>
                    ) : (
                      <span className="text-[10px] text-text-muted">No budget</span>
                    )}
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-xs font-mono text-text-secondary">{formatNumber(Number(m.queries) || 0)}</p>
                  </div>
                  <div className="col-span-1 text-right">
                    {m.lastActive ? (
                      <Badge size="sm" variant="success">Active</Badge>
                    ) : (
                      <Badge size="sm">Idle</Badge>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>

      {/* My Token Allocation Card */}
      <Card padding="lg">
        <h3 className="text-sm font-medium text-text-secondary mb-3">My Token Allocation</h3>
        <p className="text-xs text-text-muted mb-4">Tokens allocated to your team to distribute</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-semibold font-mono text-text-primary">{formatTokens(membersWithBudget.reduce((s, m) => s + (Number(m.budgetCap) || 0), 0))}</p>
            <p className="text-[10px] text-text-muted mt-1">Total Distributed</p>
          </div>
          <div>
            <p className="text-lg font-semibold font-mono text-text-primary">{formatTokens(membersWithBudget.reduce((s, m) => s + (Number(m.budgetUsed) || 0), 0))}</p>
            <p className="text-[10px] text-text-muted mt-1">Used by Team</p>
          </div>
          <div>
            <p className="text-lg font-semibold font-mono text-primary">{formatTokens(membersWithBudget.reduce((s, m) => s + Math.max(0, (Number(m.budgetCap) || 0) - (Number(m.budgetUsed) || 0)), 0))}</p>
            <p className="text-[10px] text-text-muted mt-1">Remaining</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/budgets')}
          className="mt-4 w-full py-2 rounded-lg text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
          style={{ border: '1px solid var(--color-primary)', background: 'transparent', cursor: 'pointer' }}
        >
          Assign to team
        </button>
      </Card>

      {/* Tasks Section */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-text-secondary">Tasks</h3>
          <button onClick={() => navigate('/tasks')} className="text-xs text-primary hover:text-primary-hover flex items-center gap-1">
            Manage Tasks <ArrowRight size={12} />
          </button>
        </div>
        <div className="text-center py-4">
          <CheckSquare size={24} className="mx-auto text-text-muted mb-2" />
          <p className="text-sm text-text-muted">Create and assign tasks to your team</p>
        </div>
      </Card>
    </div>
  )
}
