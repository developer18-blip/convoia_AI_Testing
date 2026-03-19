import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, BarChart3, Activity, Building2, Users } from 'lucide-react'
import { StatCard } from '../../../components/shared/StatCard'
import { Card } from '../../../components/ui/Card'
import { LineChart } from '../../../components/charts/LineChart'
import { BarChart } from '../../../components/charts/BarChart'
import { formatCurrency, formatNumber } from '../../../lib/utils'
import api from '../../../lib/api'

interface AdminStats {
  revenue: number
  providerCost: number
  profitMargin: number
  queriesToday: number
  activeOrgs: number
  newUsers: number
  dailyRevenue: Array<{ date: string; revenue: number; cost: number }>
  topOrgs: Array<{ name: string; revenue: number; queries: number }>
  providerRevenue: Array<{ provider: string; revenue: number }>
}

export function AdminView() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      api.get('/usage/admin'),
      api.get('/admin/stats'),
    ]).then(([revRes, statsRes]) => {
      const rev = revRes.status === 'fulfilled' ? revRes.value.data?.data : null
      const st = statsRes.status === 'fulfilled' ? statsRes.value.data?.data : null

      const totalRev = Number(rev?.thisMonth?.customerRevenue ?? rev?.allTime?.totalCustomerRevenue ?? 0) || 0
      const totalCost = Number(rev?.thisMonth?.providerCost ?? rev?.allTime?.totalProviderCost ?? 0) || 0
      const margin = totalRev > 0 ? ((totalRev - totalCost) / totalRev) * 100 : 0

      setStats({
        revenue: totalRev,
        providerCost: totalCost,
        profitMargin: margin,
        queriesToday: Number(st?.queriesToday ?? rev?.thisMonth?.totalQueries ?? 0) || 0,
        activeOrgs: Number(st?.activeOrgs ?? st?.totalOrganizations ?? 0) || 0,
        newUsers: Number(rev?.thisMonth?.newUsers ?? st?.newUsersThisMonth ?? 0) || 0,
        dailyRevenue: (Array.isArray(rev?.dailyRevenue) ? rev.dailyRevenue : []).map((d: Record<string, unknown>) => ({
          date: String(d.date ?? ''),
          revenue: Number(d.revenue ?? 0) || 0,
          cost: Number(d.providerCost ?? 0) || 0,
        })),
        topOrgs: (Array.isArray(rev?.topOrgs) ? rev.topOrgs : []).map((o: Record<string, unknown>) => ({
          name: String(o.name ?? 'Unknown'),
          revenue: Number(o.totalSpend ?? 0) || 0,
          queries: Number(o.totalQueries ?? 0) || 0,
        })),
        providerRevenue: Object.entries((rev?.revenueByProvider ?? {}) as Record<string, Record<string, unknown>>).map(([provider, data]) => ({
          provider,
          revenue: Number(data?.customerRevenue ?? 0) || 0,
        })),
      })
      setIsLoading(false)
    })
  }, [])

  if (isLoading || !stats) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-surface-2 rounded w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-surface-2 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary">Admin Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Revenue" value={formatCurrency(stats.revenue)} subtitle="This month" icon={<DollarSign size={20} />} />
        <StatCard title="Provider Cost" value={formatCurrency(stats.providerCost)} subtitle="This month" icon={<TrendingUp size={20} />} />
        <StatCard title="Profit Margin" value={`${stats.profitMargin.toFixed(1)}%`} icon={<BarChart3 size={20} />} />
        <StatCard title="Queries Today" value={formatNumber(stats.queriesToday)} icon={<Activity size={20} />} />
        <StatCard title="Active Orgs" value={String(stats.activeOrgs)} icon={<Building2 size={20} />} />
        <StatCard title="New Users" value={String(stats.newUsers)} subtitle="This month" icon={<Users size={20} />} />
      </div>

      <Card padding="lg">
        <h3 className="text-sm font-medium text-text-secondary mb-4">Revenue vs Cost (30 Days)</h3>
        <LineChart
          data={stats.dailyRevenue}
          xKey="date"
          yKey="revenue"
          yKey2="cost"
          color="#7C3AED"
          color2="#EF4444"
          height={300}
          formatY={(v: number) => `$${v.toFixed(0)}`}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="none">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-medium text-text-secondary">Top 10 Organizations</h3>
          </div>
          <div className="divide-y divide-border/50">
            {stats.topOrgs.length === 0 ? (
              <div className="px-5 py-8 text-center text-text-muted text-sm">No data</div>
            ) : (
              stats.topOrgs.slice(0, 10).map((org, i) => (
                <div key={org.name} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-sm font-mono text-text-muted w-6">#{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">{org.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-text-primary">{formatCurrency(org.revenue)}</p>
                    <p className="text-xs text-text-muted">{formatNumber(org.queries)} queries</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
        <Card padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Revenue by Provider</h3>
          <BarChart
            data={stats.providerRevenue.map((p) => ({ name: p.provider, value: p.revenue }))}
            xKey="name"
            yKey="value"
            height={300}
            formatY={(v: number) => `$${v.toFixed(0)}`}
          />
        </Card>
      </div>
    </div>
  )
}
