import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, BarChart3, Building2, Users, Search } from 'lucide-react'
import { StatCard } from '../components/shared/StatCard'
import { Card } from '../components/ui/Card'
import { LineChart } from '../components/charts/LineChart'
import { DonutChart } from '../components/charts/DonutChart'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { formatCurrency, formatNumber } from '../lib/utils'
import api from '../lib/api'

export function AdminRevenuePage() {
  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    api.get('/admin/revenue/dashboard').then((res) => setData(res.data.data))
      .catch(() => setError('Failed to load revenue data')).finally(() => setIsLoading(false))
  }, [])

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} />

  const revenue = data?.revenue ?? data?.totalRevenue ?? 0
  const cost = data?.cost ?? data?.totalProviderCost ?? 0
  const profit = data?.profit ?? (revenue - cost)
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0

  const dailyData = data?.dailyRevenue || []
  const providerData = (data?.providerBreakdown || data?.providerRevenue || []).map((p: any) => ({ name: p.provider, value: p.revenue }))
  const topOrgs = data?.topOrgs || []
  const topPersonalUsers = data?.topPersonalUsers || []

  const filteredOrgs = topOrgs.filter((o: any) =>
    o.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredPersonal = topPersonalUsers.filter((u: any) =>
    (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary">Revenue</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={formatCurrency(revenue)} icon={<DollarSign size={20} />} />
        <StatCard title="Provider Cost" value={formatCurrency(cost)} icon={<TrendingUp size={20} />} />
        <StatCard title="Profit" value={formatCurrency(profit)} icon={<BarChart3 size={20} />} />
        <StatCard title="Margin" value={`${margin.toFixed(1)}%`} icon={<TrendingUp size={20} />} />
      </div>

      <Card padding="lg">
        <h3 className="text-sm font-medium text-text-secondary mb-4">Revenue vs Cost</h3>
        {dailyData.length > 0 ? (
          <LineChart data={dailyData} xKey="date" yKey="revenue" yKey2="cost" color="#7C3AED" color2="#EF4444" height={320} formatY={(v: number) => `$${v.toFixed(0)}`} />
        ) : <div className="h-[320px] flex items-center justify-center text-text-muted">No data</div>}
      </Card>

      <Card padding="lg">
        <h3 className="text-sm font-medium text-text-secondary mb-4">Revenue by Provider</h3>
        {providerData.length > 0 ? <DonutChart data={providerData} /> : <p className="text-center text-text-muted py-8">No data</p>}
      </Card>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search organizations or users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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
            {filteredOrgs.length === 0 ? (
              <div className="px-5 py-8 text-center text-text-muted text-sm">No organizations found</div>
            ) : filteredOrgs.slice(0, 10).map((org: any, i: number) => (
              <div key={`${org.name}-${i}`} className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2 transition-colors">
                <span className="text-sm font-mono text-text-muted w-6">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{org.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-primary">{formatCurrency(org.revenue)}</p>
                  <p className="text-xs text-text-muted">{formatNumber(org.queries)} queries</p>
                </div>
              </div>
            ))}
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
            {filteredPersonal.length === 0 ? (
              <div className="px-5 py-8 text-center text-text-muted text-sm">No personal users found</div>
            ) : filteredPersonal.slice(0, 10).map((user: any, i: number) => (
              <div key={user.userId} className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2 transition-colors">
                <span className="text-sm font-mono text-text-muted w-6">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
                  <p className="text-xs text-text-muted truncate">{user.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-primary">{formatCurrency(user.revenue)}</p>
                  <p className="text-xs text-text-muted">{formatNumber(user.queries)} queries</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default AdminRevenuePage;
