import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Mail, Calendar, BarChart3, DollarSign, Zap, Activity } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { StatCard } from '../components/shared/StatCard'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { LineChart } from '../components/charts/LineChart'
import { BarChart } from '../components/charts/BarChart'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { formatCurrency, formatNumber, formatDate } from '../lib/utils'
import api from '../lib/api'

interface UserStats {
  userId: string
  email: string
  name: string
  totalQueries: number
  totalTokensUsed: number
  totalCost: number
  topModels: Array<{ modelName: string; usageCount: number; tokensCost: number }>
  dailyBreakdown: Array<{ date: string; queries: number; tokensUsed: number; cost: number }>
}

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    setIsLoading(true)
    Promise.allSettled([
      api.get(`/admin/users/${userId}/stats`),
      api.get(`/admin/users?search=&page=1`),
    ]).then(([statsRes, usersRes]) => {
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data.data)
      } else {
        setError('Failed to load user stats')
      }
      // Try to find user info from the users list or stats
      if (usersRes.status === 'fulfilled') {
        const allUsers = usersRes.value.data.data?.data || usersRes.value.data.data || []
        const found = allUsers.find((u: any) => u.id === userId)
        if (found) setUser(found)
      }
      setIsLoading(false)
    })
  }, [userId])

  const downloadCSV = () => {
    if (!stats) return
    const rows = [
      ['Date', 'Queries', 'Tokens Used', 'Cost ($)'],
      ...stats.dailyBreakdown.map((d) => [d.date, d.queries, d.tokensUsed, d.cost.toFixed(4)]),
      [],
      ['Total', stats.totalQueries, stats.totalTokensUsed, stats.totalCost.toFixed(4)],
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `user-${stats.name || stats.email}-usage.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <LoadingPage />
  if (error || !stats) return <ErrorState message={error || 'User not found'} onRetry={() => navigate(-1)} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-surface-2 text-text-muted transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <Avatar name={stats.name || stats.email} src={user?.avatar} size="lg" />
            <div>
              <h2 className="text-2xl font-semibold text-text-primary">{stats.name}</h2>
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <span className="flex items-center gap-1"><Mail size={13} /> {stats.email}</span>
                {user?.role && <Badge size="sm" variant="primary">{user.role}</Badge>}
                {user?.organization?.name && <span>· {user.organization.name}</span>}
                {user?.createdAt && <span className="flex items-center gap-1"><Calendar size={13} /> Joined {formatDate(user.createdAt)}</span>}
              </div>
            </div>
          </div>
        </div>
        <button onClick={downloadCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Queries" value={formatNumber(stats.totalQueries)} icon={<Activity size={20} />} />
        <StatCard title="Total Tokens" value={formatNumber(stats.totalTokensUsed)} icon={<Zap size={20} />} />
        <StatCard title="Total Cost" value={formatCurrency(stats.totalCost)} icon={<DollarSign size={20} />} />
        <StatCard title="Avg Cost/Query" value={formatCurrency(stats.totalQueries > 0 ? stats.totalCost / stats.totalQueries : 0)} icon={<BarChart3 size={20} />} />
      </div>

      {/* Daily Usage Chart */}
      <Card padding="lg">
        <h3 className="text-sm font-medium text-text-secondary mb-4">Daily Usage</h3>
        {stats.dailyBreakdown.length > 0 ? (
          <LineChart
            data={stats.dailyBreakdown}
            xKey="date"
            yKey="cost"
            color="#7C3AED"
            height={280}
            formatY={(v: number) => `$${v.toFixed(2)}`}
          />
        ) : (
          <div className="h-[280px] flex items-center justify-center text-text-muted">No usage data</div>
        )}
      </Card>

      {/* Top Models */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="none">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Top Models Used</h3>
          </div>
          <div className="divide-y divide-border/50">
            {stats.topModels.length === 0 ? (
              <div className="px-5 py-8 text-center text-text-muted text-sm">No model usage</div>
            ) : stats.topModels.map((m, i) => (
              <div key={m.modelName} className="px-5 py-3 flex items-center gap-3">
                <span className="text-sm font-mono text-text-muted w-6">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{m.modelName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-text-primary">{formatCurrency(m.tokensCost)}</p>
                  <p className="text-xs text-text-muted">{formatNumber(m.usageCount)} queries</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Queries by Model</h3>
          {stats.topModels.length > 0 ? (
            <BarChart
              data={stats.topModels.map((m) => ({ name: m.modelName, value: m.usageCount }))}
              xKey="name"
              yKey="value"
              height={280}
            />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-text-muted">No data</div>
          )}
        </Card>
      </div>

      {/* Recent Usage Table */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Daily Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Queries</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Tokens</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Cost</th>
              </tr>
            </thead>
            <tbody>
              {stats.dailyBreakdown.slice().reverse().slice(0, 30).map((d) => (
                <tr key={d.date} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 text-sm text-text-primary">{d.date}</td>
                  <td className="px-4 py-2.5 text-sm text-text-secondary text-right">{formatNumber(d.queries)}</td>
                  <td className="px-4 py-2.5 text-sm text-text-secondary text-right">{formatNumber(d.tokensUsed)}</td>
                  <td className="px-4 py-2.5 text-sm font-mono text-text-primary text-right">{formatCurrency(d.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

export default AdminUserDetailPage
