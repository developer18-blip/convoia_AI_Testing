import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Building2, Users, DollarSign, Activity, Zap, BarChart3 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { StatCard } from '../components/shared/StatCard'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { LineChart } from '../components/charts/LineChart'
import { BarChart } from '../components/charts/BarChart'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { formatCurrency, formatNumber } from '../lib/utils'
import api from '../lib/api'

interface OrgStats {
  organizationId: string
  organizationName: string
  organizationEmail: string | null
  organizationTier: string | null
  organizationStatus: string | null
  organizationIndustry: string | null
  totalUsers: number
  totalQueries: number
  totalTokensUsed: number
  totalCost: number
  topUsers: Array<{ userId: string; email: string; name: string; avatar?: string | null; queries: number; cost: number }>
  topModels: Array<{ modelName: string; usageCount: number; totalCost: number }>
  dailyBreakdown: Array<{ date: string; queries: number; cost: number }>
}

export function AdminOrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const [stats, setStats] = useState<OrgStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    if (!orgId) return
    setIsLoading(true); setError(null)
    try {
      const res = await api.get(`/admin/organizations/${orgId}/stats`)
      setStats(res.data.data)
    } catch {
      setError('Failed to load organization stats')
    } finally {
      setIsLoading(false)
    }
  }, [orgId])

  useEffect(() => { fetchStats() }, [fetchStats])

  const downloadCSV = () => {
    if (!stats) return

    // Build CSV with multiple sections
    const sections: string[][] = []

    // Summary
    sections.push(['Organization Usage Report', ''])
    sections.push(['Organization', stats.organizationName])
    sections.push(['Total Users', String(stats.totalUsers)])
    sections.push(['Total Queries', String(stats.totalQueries)])
    sections.push(['Total Tokens', String(stats.totalTokensUsed)])
    sections.push(['Total Cost', `$${stats.totalCost.toFixed(4)}`])
    sections.push([])

    // Top Users
    sections.push(['Top Users'])
    sections.push(['Name', 'Email', 'Queries', 'Cost ($)'])
    stats.topUsers.forEach((u) => sections.push([u.name, u.email, String(u.queries), u.cost.toFixed(4)]))
    sections.push([])

    // Top Models
    sections.push(['Top Models'])
    sections.push(['Model', 'Queries', 'Cost ($)'])
    stats.topModels.forEach((m) => sections.push([m.modelName, String(m.usageCount), m.totalCost.toFixed(4)]))
    sections.push([])

    // Daily Breakdown
    sections.push(['Daily Breakdown'])
    sections.push(['Date', 'Queries', 'Cost ($)'])
    stats.dailyBreakdown.forEach((d) => sections.push([d.date, String(d.queries), d.cost.toFixed(4)]))

    const csv = sections.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `org-${stats.organizationName}-usage.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <LoadingPage />
  if (error || !stats) return <ErrorState message={error || 'Organization not found'} onRetry={fetchStats} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-surface-2 text-text-muted transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
              <Building2 size={24} className="text-primary" /> {stats.organizationName}
            </h2>
            <div className="flex items-center gap-3 text-sm text-text-muted mt-1">
              {stats.organizationEmail && <span>{stats.organizationEmail}</span>}
              {stats.organizationTier && <Badge size="sm" variant="primary">{stats.organizationTier}</Badge>}
              {stats.organizationStatus && <Badge size="sm" variant={stats.organizationStatus === 'active' ? 'success' : 'danger'}>{stats.organizationStatus}</Badge>}
              {stats.organizationIndustry && <span>· {stats.organizationIndustry}</span>}
            </div>
          </div>
        </div>
        <button onClick={downloadCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Members" value={String(stats.totalUsers)} icon={<Users size={20} />} />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Users */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Users size={16} className="text-primary" /> Top Users
            </h3>
          </div>
          <div className="divide-y divide-border/50" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {stats.topUsers.length === 0 ? (
              <div className="px-5 py-8 text-center text-text-muted text-sm">No user data</div>
            ) : stats.topUsers.map((u, i) => (
              <div key={u.userId}
                onClick={() => navigate(`/admin/users/${u.userId}`)}
                className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2 transition-colors cursor-pointer">
                <span className="text-sm font-mono text-text-muted w-6">#{i + 1}</span>
                <Avatar name={u.name} src={u.avatar} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{u.name}</p>
                  <p className="text-xs text-text-muted truncate">{u.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-text-primary">{formatCurrency(u.cost)}</p>
                  <p className="text-xs text-text-muted">{formatNumber(u.queries)} queries</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Models */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Top Models</h3>
          </div>
          <div className="divide-y divide-border/50">
            {stats.topModels.length === 0 ? (
              <div className="px-5 py-8 text-center text-text-muted text-sm">No model data</div>
            ) : stats.topModels.map((m, i) => (
              <div key={m.modelName} className="px-5 py-3 flex items-center gap-3">
                <span className="text-sm font-mono text-text-muted w-6">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{m.modelName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-text-primary">{formatCurrency(m.totalCost)}</p>
                  <p className="text-xs text-text-muted">{formatNumber(m.usageCount)} queries</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Model Usage Chart */}
      {stats.topModels.length > 0 && (
        <Card padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Queries by Model</h3>
          <BarChart
            data={stats.topModels.map((m) => ({ name: m.modelName, value: m.usageCount }))}
            xKey="name"
            yKey="value"
            height={280}
          />
        </Card>
      )}
    </div>
  )
}

export default AdminOrgDetailPage
