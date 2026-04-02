import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, Users, Activity, Zap, TrendingUp, BarChart3, Download, Coins } from 'lucide-react'
import { StatCard } from '../components/shared/StatCard'
import { Card } from '../components/ui/Card'
import { LineChart } from '../components/charts/LineChart'
import { BarChart } from '../components/charts/BarChart'
import { DonutChart } from '../components/charts/DonutChart'
import { Avatar } from '../components/ui/Avatar'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { formatCurrency, formatNumber } from '../lib/utils'
import api from '../lib/api'

export function AdminFullAnalyticsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  const fetchData = async () => {
    setIsLoading(true); setError(null)
    try {
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const res = await api.get(`/admin/analytics?from=${from}`)
      setData(res.data.data)
    } catch {
      setError('Failed to load analytics')
    }
    setIsLoading(false)
  }

  useEffect(() => { fetchData() }, [days])

  const downloadCSV = () => {
    if (!data) return
    const rows: string[][] = []
    rows.push(['Convoia AI Platform Analytics Report'])
    rows.push(['Period', `Last ${days} days`])
    rows.push([])

    // Overview
    rows.push(['OVERVIEW'])
    rows.push(['Metric', 'Value'])
    const o = data.overview
    rows.push(['Total Users', o.totalUsers], ['Total Orgs', o.totalOrgs], ['Active Users', o.activeUsers],
      ['Total Queries', o.totalQueries], ['Total Revenue', `$${o.totalRevenue}`], ['Total Cost', `$${o.totalCost}`],
      ['Profit', `$${o.totalProfit}`], ['Margin', `${o.profitMargin}%`], ['Tokens Used', String(o.totalTokensUsed)])
    rows.push([])

    // Token Summary
    rows.push(['TOKEN SUMMARY'])
    const t = data.tokenSummary
    rows.push(['Total Balance (all wallets)', String(t.totalTokenBalance)], ['Total Purchased', String(t.totalTokensPurchased)], ['Total Spent', String(t.totalTokensSpent)])
    rows.push([])

    // Top Users
    rows.push(['TOP USERS BY SPEND'])
    rows.push(['Name', 'Email', 'Queries', 'Cost ($)', 'Tokens'])
    data.topUsers.forEach((u: any) => rows.push([u.name, u.email, u.queries, u.cost.toFixed(4), u.tokens]))
    rows.push([])

    // Top Models
    rows.push(['TOP MODELS'])
    rows.push(['Model', 'Provider', 'Queries', 'Cost ($)'])
    data.topModels.forEach((m: any) => rows.push([m.name, m.provider, m.queries, m.cost.toFixed(4)]))
    rows.push([])

    // Daily
    rows.push(['DAILY USAGE'])
    rows.push(['Date', 'Queries', 'Revenue ($)', 'Cost ($)', 'Tokens'])
    data.dailyUsage.forEach((d: any) => rows.push([d.date, d.queries, d.revenue, d.cost, d.tokens]))

    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `convoia-analytics-${days}d.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <LoadingPage />
  if (error || !data) return <ErrorState message={error || 'No data'} onRetry={fetchData} />

  const ov = data.overview
  const ts = data.tokenSummary

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-semibold text-text-primary">Platform Analytics</h2>
        <div className="flex items-center gap-3">
          {/* Period toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[7, 14, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${days === d ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:bg-surface-2'}`}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard title="Total Users" value={formatNumber(ov.totalUsers)} icon={<Users size={18} />} />
        <StatCard title="Active Users" value={formatNumber(ov.activeUsers)} subtitle={`${days}d`} icon={<Activity size={18} />} />
        <StatCard title="Queries" value={formatNumber(ov.totalQueries)} subtitle={`${days}d`} icon={<BarChart3 size={18} />} />
        <StatCard title="Revenue" value={formatCurrency(ov.totalRevenue)} subtitle={`${days}d`} icon={<DollarSign size={18} />} />
        <StatCard title="Profit" value={formatCurrency(ov.totalProfit)} subtitle={`${ov.profitMargin}% margin`} icon={<TrendingUp size={18} />} />
      </div>

      {/* Token Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard title="Token Balance (all wallets)" value={formatNumber(ts.totalTokenBalance)} icon={<Coins size={18} />} />
        <StatCard title="Tokens Purchased" value={formatNumber(ts.totalTokensPurchased)} icon={<Zap size={18} />} />
        <StatCard title="Tokens Spent" value={formatNumber(ts.totalTokensSpent)} icon={<Zap size={18} />} />
      </div>

      {/* Daily Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Revenue vs Cost</h3>
          <LineChart data={data.dailyUsage} xKey="date" yKey="revenue" yKey2="cost" color="#7C3AED" color2="#EF4444" height={280} formatY={(v: number) => `$${v.toFixed(0)}`} />
        </Card>
        <Card padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Daily Queries</h3>
          <BarChart data={data.dailyUsage} xKey="date" yKey="queries" height={280} />
        </Card>
      </div>

      {/* Provider + Model Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Revenue by Provider</h3>
          {data.providerBreakdown.length > 0 ? (
            <DonutChart data={data.providerBreakdown.map((p: any) => ({ name: p.provider, value: p.revenue }))} />
          ) : <p className="text-center text-text-muted py-8">No data</p>}
        </Card>
        <Card padding="none">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Provider Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-medium text-text-muted uppercase">Provider</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-text-muted uppercase">Queries</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-text-muted uppercase">Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-text-muted uppercase">Cost</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-text-muted uppercase">Profit</th>
              </tr></thead>
              <tbody>
                {data.providerBreakdown.map((p: any) => (
                  <tr key={p.provider} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="px-4 py-2 text-sm font-medium text-text-primary">{p.provider}</td>
                    <td className="px-4 py-2 text-sm text-text-secondary text-right">{formatNumber(p.queries)}</td>
                    <td className="px-4 py-2 text-sm font-mono text-text-primary text-right">{formatCurrency(p.revenue)}</td>
                    <td className="px-4 py-2 text-sm font-mono text-text-muted text-right">{formatCurrency(p.cost)}</td>
                    <td className="px-4 py-2 text-sm font-mono text-right" style={{ color: p.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{formatCurrency(p.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Top Models */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Top Models</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-medium text-text-muted uppercase">Model</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-muted uppercase">Provider</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-text-muted uppercase">Queries</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-text-muted uppercase">Cost</th>
            </tr></thead>
            <tbody>
              {data.topModels.map((m: any) => (
                <tr key={m.name} className="border-b border-border/50 hover:bg-surface-2">
                  <td className="px-4 py-2 text-sm font-medium text-text-primary">{m.name}</td>
                  <td className="px-4 py-2 text-sm text-text-muted">{m.provider}</td>
                  <td className="px-4 py-2 text-sm text-text-secondary text-right">{formatNumber(m.queries)}</td>
                  <td className="px-4 py-2 text-sm font-mono text-text-primary text-right">{formatCurrency(m.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top Users + Top Token Holders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="none">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Top Users by Spend</h3>
          </div>
          <div className="divide-y divide-border/50" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {data.topUsers.map((u: any, i: number) => (
              <div key={u.userId} onClick={() => navigate(`/admin/users/${u.userId}`)}
                className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2 cursor-pointer transition-colors">
                <span className="text-xs font-mono text-text-muted w-5">#{i + 1}</span>
                <Avatar name={u.name} size="sm" />
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

        <Card padding="none">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Top Token Holders</h3>
          </div>
          <div className="divide-y divide-border/50" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {data.topTokenHolders.map((u: any, i: number) => (
              <div key={u.userId} onClick={() => navigate(`/admin/users/${u.userId}`)}
                className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2 cursor-pointer transition-colors">
                <span className="text-xs font-mono text-text-muted w-5">#{i + 1}</span>
                <Avatar name={u.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{u.name}</p>
                  <p className="text-xs text-text-muted truncate">{u.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-text-primary">{formatNumber(u.balance)} tokens</p>
                  <p className="text-xs text-text-muted">bought {formatNumber(u.purchased)} · used {formatNumber(u.used)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default AdminFullAnalyticsPage
