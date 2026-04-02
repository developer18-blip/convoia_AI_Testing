import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, TrendingUp, BarChart3, Activity, Building2, Users, Search, Download } from 'lucide-react'
import { StatCard } from '../../../components/shared/StatCard'
import { Card } from '../../../components/ui/Card'
import { LineChart } from '../../../components/charts/LineChart'
import { BarChart } from '../../../components/charts/BarChart'
import { formatCurrency, formatNumber } from '../../../lib/utils'
import api from '../../../lib/api'

interface OrgEntry { organizationId: string; name: string; revenue: number; queries: number }
interface PersonalEntry { name: string; email: string; userId: string; revenue: number; queries: number }

interface AdminStats {
  revenue: number
  providerCost: number
  profitMargin: number
  queriesToday: number
  activeOrgs: number
  newUsers: number
  dailyRevenue: Array<{ date: string; revenue: number; cost: number }>
  topOrgs: OrgEntry[]
  topPersonalUsers: PersonalEntry[]
  providerRevenue: Array<{ provider: string; revenue: number }>
}

export function AdminView() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [orgSearch, setOrgSearch] = useState('')

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
        topOrgs: (Array.isArray(rev?.topOrganizations) ? rev.topOrganizations : Array.isArray(rev?.topOrgs) ? rev.topOrgs : []).map((o: Record<string, unknown>) => ({
          organizationId: String(o.organizationId ?? ''),
          name: String(o.name ?? 'Unknown'),
          revenue: Number(o.totalSpend ?? 0) || 0,
          queries: Number(o.totalQueries ?? 0) || 0,
        })),
        topPersonalUsers: (Array.isArray(rev?.topPersonalUsers) ? rev.topPersonalUsers : []).map((u: Record<string, unknown>) => ({
          name: String(u.name ?? 'Unknown'),
          email: String(u.email ?? ''),
          userId: String(u.userId ?? ''),
          revenue: Number(u.totalSpend ?? 0) || 0,
          queries: Number(u.totalQueries ?? 0) || 0,
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-text-primary">Admin Dashboard</h2>
        <button onClick={() => {
          const rows = [
            ['Type', 'Name', 'Email', 'Revenue ($)', 'Queries'],
            ...stats.topOrgs.map((o) => ['Organization', o.name, '', o.revenue.toFixed(4), String(o.queries)]),
            ...stats.topPersonalUsers.map((u) => ['Personal', u.name, u.email, u.revenue.toFixed(4), String(u.queries)]),
          ]
          const csv = rows.map((r) => r.join(',')).join('\n')
          const blob = new Blob([csv], { type: 'text/csv' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = 'admin-dashboard-export.csv'; a.click()
          URL.revokeObjectURL(url)
        }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
          <Download size={16} /> Export CSV
        </button>
      </div>

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

      {/* Search bar for orgs/users */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search organizations or users..."
          value={orgSearch}
          onChange={(e) => setOrgSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Organizations */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              Top Organizations
            </h3>
          </div>
          <div className="divide-y divide-border/50" style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {(() => {
              const filtered = stats.topOrgs.filter((o) =>
                o.name.toLowerCase().includes(orgSearch.toLowerCase())
              )
              if (filtered.length === 0) {
                return <div className="px-5 py-8 text-center text-text-muted text-sm">No organizations found</div>
              }
              return filtered.slice(0, 10).map((org, i) => (
                <div key={`${org.name}-${i}`}
                  onClick={() => org.organizationId && navigate(`/admin/orgs/${org.organizationId}`)}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2 transition-colors cursor-pointer">
                  <span className="text-sm font-mono text-text-muted w-6">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{org.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono text-text-primary">{formatCurrency(org.revenue)}</p>
                    <p className="text-xs text-text-muted">{formatNumber(org.queries)} queries</p>
                  </div>
                </div>
              ))
            })()}
          </div>
        </Card>

        {/* Top Personal Users */}
        <Card padding="none">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Users size={16} className="text-primary" />
              Top Personal Users
            </h3>
          </div>
          <div className="divide-y divide-border/50" style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {(() => {
              const filtered = stats.topPersonalUsers.filter((u) =>
                u.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
                u.email.toLowerCase().includes(orgSearch.toLowerCase())
              )
              if (filtered.length === 0) {
                return <div className="px-5 py-8 text-center text-text-muted text-sm">No personal users found</div>
              }
              return filtered.slice(0, 10).map((user, i) => (
                <div key={user.userId}
                  onClick={() => navigate(`/admin/users/${user.userId}`)}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2 transition-colors cursor-pointer">
                  <span className="text-sm font-mono text-text-muted w-6">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
                    <p className="text-xs text-text-muted truncate">{user.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono text-text-primary">{formatCurrency(user.revenue)}</p>
                    <p className="text-xs text-text-muted">{formatNumber(user.queries)} queries</p>
                  </div>
                </div>
              ))
            })()}
          </div>
        </Card>
      </div>

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
  )
}
