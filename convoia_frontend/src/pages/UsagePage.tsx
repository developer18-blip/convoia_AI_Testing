import { useCallback, useContext, useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { BarChart3, Clock, FileText, Zap, MessageSquare } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { StatCard } from '../components/shared/StatCard'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { Modal } from '../components/ui/Modal'
import { ProviderBadge } from '../components/shared/ProviderBadge'
import { AreaChart } from '../components/charts/AreaChart'
import { BarChart } from '../components/charts/BarChart'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { EmptyState } from '../components/shared/EmptyState'
import { formatCurrency, formatTokens, formatDateTime, truncate } from '../lib/utils'
import api from '../lib/api'
import { ThemeContext } from '../contexts/ThemeContext'
import type { UsageLog } from '../types'

interface DashboardStats {
  today: { queries: number; cost: number; tokens: number }
  thisWeek: { queries: number; cost: number; tokens: number }
  thisMonth: { queries: number; cost: number; tokens: number }
  lastMonth: { queries: number; cost: number; tokens: number }
  topModels: Array<{ name: string; queries: number; cost: number }>
  dailyUsage: Array<{ date: string; cost: number; queries: number }>
  providerBreakdown: Array<{ provider: string; queries: number; cost: number }>
}

interface ModelOption {
  id: string
  name: string
  provider: string
}

function safePeriod(data: unknown): { queries: number; cost: number; tokens: number } {
  if (!data || typeof data !== 'object') return { queries: 0, cost: 0, tokens: 0 }
  const d = data as Record<string, unknown>
  return {
    queries: Number(d.queries ?? 0) || 0,
    cost: Number(d.cost ?? 0) || 0,
    tokens: Number(d.tokens ?? 0) || 0,
  }
}

export function UsagePage() {
  const { theme } = useContext(ThemeContext)
  const chartColor = theme === 'dark' ? '#10A37F' : '#3B5BDB'
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const defaultTab = searchParams.get('tab') || 'overview'
  const [tab, setTab] = useState(defaultTab)

  // Overview state
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  // History state
  const [queries, setQueries] = useState<UsageLog[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })
  const [historyLoading, setHistoryLoading] = useState(false)
  const [filters, setFilters] = useState({ page: 1, limit: 20, modelId: '', startDate: '', endDate: '' })
  const [models, setModels] = useState<ModelOption[]>([])

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<UsageLog | null>(null)

  // Fetch overview stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true)
        setStatsError(null)
        const res = await api.get('/usage/dashboard')
        const raw = res.data?.data
        if (raw) {
          setStats({
            today: safePeriod(raw.today),
            thisWeek: safePeriod(raw.thisWeek),
            thisMonth: safePeriod(raw.thisMonth),
            lastMonth: safePeriod(raw.lastMonth),
            topModels: Array.isArray(raw.topModels) ? raw.topModels : [],
            dailyUsage: Array.isArray(raw.dailyUsage) ? raw.dailyUsage : [],
            providerBreakdown: Array.isArray(raw.providerBreakdown) ? raw.providerBreakdown : [],
          })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load usage data'
        setStatsError(msg)
      } finally {
        setStatsLoading(false)
      }
    }
    fetchStats()
  }, [])

  // Fetch models for filter dropdown
  useEffect(() => {
    api.get('/models')
      .then((res) => setModels(res.data?.data ?? []))
      .catch(() => {})
  }, [])

  // Fetch history
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', filters.page.toString())
      params.append('limit', filters.limit.toString())
      if (filters.modelId) params.append('modelId', filters.modelId)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)

      const res = await api.get(`/usage/my?${params.toString()}`)
      const data = res.data?.data
      const items = data?.queries ?? data?.data ?? data?.transactions ?? data?.usageLogs ?? (Array.isArray(data) ? data : [])
      setQueries(items)
      setPagination(data?.pagination ?? { page: filters.page, limit: filters.limit, total: items.length, pages: 1 })
    } catch {
      setQueries([])
    } finally {
      setHistoryLoading(false)
    }
  }, [filters])

  useEffect(() => {
    if (tab === 'history' || tab === 'analytics') {
      fetchHistory()
    }
  }, [tab, fetchHistory])

  if (statsLoading && tab === 'overview') return <LoadingPage />
  if (statsError && tab === 'overview') return <ErrorState message={statsError} onRetry={() => window.location.reload()} />

  const monthQueries = stats?.thisMonth?.queries ?? 0
  const monthTokens = stats?.thisMonth?.tokens ?? 0
  const monthCost = stats?.thisMonth?.cost ?? 0
  const avgCost = monthQueries > 0 ? monthCost / monthQueries : 0
  const totalModelCost = (stats?.topModels ?? []).reduce((s, m) => s + (Number(m.cost) || 0), 0)
  const totalProviderCost = (stats?.providerBreakdown ?? []).reduce((s, p) => s + (Number(p.cost) || 0), 0)

  // Analytics: group queries by hour of day and day of week
  const hourData: Array<{ hour: string; cost: number }> = []
  const dayData: Array<{ day: string; cost: number }> = []
  if (queries.length > 0) {
    const hourMap: Record<number, number> = {}
    const dayMap: Record<number, number> = {}
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    for (const q of queries) {
      const d = new Date(q.createdAt)
      const h = d.getHours()
      hourMap[h] = (hourMap[h] || 0) + (q.customerPrice || 0)
      const wd = d.getDay()
      dayMap[wd] = (dayMap[wd] || 0) + (q.customerPrice || 0)
    }
    for (let i = 0; i < 24; i++) {
      hourData.push({ hour: `${i}:00`, cost: hourMap[i] || 0 })
    }
    for (let i = 0; i < 7; i++) {
      dayData.push({ day: dayNames[i], cost: dayMap[i] || 0 })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-text-primary">Usage</h2>
      </div>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'history', label: 'History' },
          { id: 'analytics', label: 'Analytics' },
        ]}
        activeTab={tab}
        onChange={setTab}
      />

      {/* ═══ OVERVIEW TAB ═══ */}
      {tab === 'overview' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Queries" value={String(monthQueries)} icon={<BarChart3 size={20} />} />
            <StatCard title="Total Tokens" value={formatTokens(monthTokens)} icon={<Zap size={20} />} />
            <StatCard title="Total Cost" value={formatCurrency(monthCost)} icon={<FileText size={20} />} />
            <StatCard title="Avg Cost / Query" value={formatCurrency(avgCost)} icon={<Clock size={20} />} />
          </div>

          <Card padding="lg">
            <h3 className="text-sm font-medium text-text-secondary mb-4">Daily Cost (Last 30 Days)</h3>
            {(stats.dailyUsage ?? []).length > 0 ? (
              <AreaChart
                data={stats.dailyUsage}
                xKey="date"
                yKey="cost"
                color={chartColor}
                height={280}
                formatY={(v: number) => `$${v.toFixed(2)}`}
              />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-text-muted text-sm">No data yet</div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Model Table */}
            <Card padding="none">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-medium text-text-secondary">By Model</h3>
              </div>
              {(stats.topModels ?? []).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Model</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Queries</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topModels.map((m, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-4 py-3 text-sm text-text-primary">{m.name}</td>
                          <td className="px-4 py-3 text-sm font-mono text-text-secondary text-right">{m.queries}</td>
                          <td className="px-4 py-3 text-sm font-mono text-primary text-right">{formatCurrency(m.cost)}</td>
                          <td className="px-4 py-3 text-sm font-mono text-text-muted text-right">
                            {totalModelCost > 0 ? ((Number(m.cost) / totalModelCost) * 100).toFixed(1) : '0.0'}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-text-muted text-sm">No data</div>
              )}
            </Card>

            {/* By Provider Table */}
            <Card padding="none">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-medium text-text-secondary">By Provider</h3>
              </div>
              {(stats.providerBreakdown ?? []).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Provider</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Queries</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.providerBreakdown.map((p, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-4 py-3 text-sm text-text-primary capitalize">{p.provider}</td>
                          <td className="px-4 py-3 text-sm font-mono text-text-secondary text-right">{p.queries}</td>
                          <td className="px-4 py-3 text-sm font-mono text-primary text-right">{formatCurrency(p.cost)}</td>
                          <td className="px-4 py-3 text-sm font-mono text-text-muted text-right">
                            {totalProviderCost > 0 ? ((Number(p.cost) / totalProviderCost) * 100).toFixed(1) : '0.0'}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-text-muted text-sm">No data</div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ═══ HISTORY TAB ═══ */}
      {tab === 'history' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <Card padding="lg">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-text-muted mb-1 block">Model</label>
                <select
                  value={filters.modelId}
                  onChange={(e) => setFilters((f) => ({ ...f, modelId: e.target.value, page: 1 }))}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">All models</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Start date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value, page: 1 }))}
                  className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">End date</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value, page: 1 }))}
                  className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <button
                onClick={() => setFilters({ page: 1, limit: 20, modelId: '', startDate: '', endDate: '' })}
                className="px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Clear filters
              </button>
              <span className="text-xs text-text-muted ml-auto">
                Showing {queries.length} queries
              </span>
            </div>
          </Card>

          <Card padding="none">
            {historyLoading ? (
              <div className="divide-y divide-border/50">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-4 py-4 flex gap-4">
                    <div className="h-4 bg-surface-2 rounded w-24 animate-pulse" />
                    <div className="h-4 bg-surface-2 rounded w-32 animate-pulse" />
                    <div className="h-4 bg-surface-2 rounded w-16 animate-pulse" />
                    <div className="h-4 bg-surface-2 rounded w-16 animate-pulse ml-auto" />
                  </div>
                ))}
              </div>
            ) : queries.length === 0 ? (
              <EmptyState
                icon={<MessageSquare size={40} />}
                title="No queries yet"
                description="Start a conversation in Chat to see your usage history."
                action={{ label: 'Go to Chat', onClick: () => navigate('/chat') }}
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Model</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Provider</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Tokens In</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Tokens Out</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Cost</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queries.map((log) => (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedLog(log)}
                          className="border-b border-border/50 hover:bg-surface-2 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-text-secondary" title={log.createdAt}>
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-primary">{log.model?.name || 'Unknown'}</td>
                          <td className="px-4 py-3">{log.model?.provider && <ProviderBadge provider={log.model.provider} />}</td>
                          <td className="px-4 py-3 text-sm text-text-secondary font-mono text-right">{formatTokens(log.tokensInput)}</td>
                          <td className="px-4 py-3 text-sm text-text-secondary font-mono text-right">{formatTokens(log.tokensOutput)}</td>
                          <td className="px-4 py-3 text-sm font-mono text-right" style={{ color: (log.customerPrice || 0) < 0.001 ? '#6366F1' : undefined }}>
                            {formatCurrency(log.customerPrice)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant={log.status === 'success' ? 'success' : log.status === 'failed' ? 'danger' : 'warning'}
                              size="sm"
                            >
                              {log.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pagination.pages > 1 && (
                  <Pagination
                    page={pagination.page}
                    pages={pagination.pages}
                    total={pagination.total}
                    onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
                  />
                )}
              </>
            )}
          </Card>
        </div>
      )}

      {/* ═══ ANALYTICS TAB ═══ */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          {/* Cost by hour of day */}
          <Card padding="lg">
            <h3 className="text-sm font-medium text-text-secondary mb-4">Cost by Hour of Day</h3>
            {hourData.length > 0 ? (
              <BarChart data={hourData} xKey="hour" yKey="cost" color={chartColor} height={250} formatY={(v: number) => `$${v.toFixed(4)}`} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-text-muted text-sm">No data yet — make some queries first</div>
            )}
          </Card>

          {/* Cost by day of week */}
          <Card padding="lg">
            <h3 className="text-sm font-medium text-text-secondary mb-4">Cost by Day of Week</h3>
            {dayData.length > 0 ? (
              <BarChart data={dayData} xKey="day" yKey="cost" color={chartColor} height={250} formatY={(v: number) => `$${v.toFixed(4)}`} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-text-muted text-sm">No data yet</div>
            )}
          </Card>

          {/* Top 10 most expensive queries */}
          <Card padding="none">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-medium text-text-secondary">Top 10 Most Expensive Queries</h3>
            </div>
            {queries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Preview</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Model</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...queries]
                      .sort((a, b) => (b.customerPrice || 0) - (a.customerPrice || 0))
                      .slice(0, 10)
                      .map((log) => (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedLog(log)}
                          className="border-b border-border/50 hover:bg-surface-2 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-text-secondary">{formatDateTime(log.createdAt)}</td>
                          <td className="px-4 py-3 text-sm text-text-primary">{truncate(log.prompt || '', 50)}</td>
                          <td className="px-4 py-3 text-sm text-text-secondary">{log.model?.name || 'Unknown'}</td>
                          <td className="px-4 py-3 text-sm font-mono text-primary text-right">{formatCurrency(log.customerPrice)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-text-muted text-sm">
                {historyLoading ? 'Loading...' : 'No queries yet'}
              </div>
            )}
          </Card>

          {/* Model efficiency */}
          <Card padding="none">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-medium text-text-secondary">Model Efficiency</h3>
            </div>
            {(stats?.topModels ?? []).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Model</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Avg Cost / Query</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Total Queries</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(stats?.topModels ?? [])]
                      .sort((a, b) => {
                        const avgA = a.queries > 0 ? a.cost / a.queries : 0
                        const avgB = b.queries > 0 ? b.cost / b.queries : 0
                        return avgA - avgB
                      })
                      .map((m, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-4 py-3 text-sm text-text-primary">{m.name}</td>
                          <td className="px-4 py-3 text-sm font-mono text-text-secondary text-right">
                            {m.queries > 0 ? formatCurrency(m.cost / m.queries) : '$0.00'}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-text-secondary text-right">{m.queries}</td>
                          <td className="px-4 py-3 text-sm font-mono text-primary text-right">{formatCurrency(m.cost)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-text-muted text-sm">No data</div>
            )}
          </Card>
        </div>
      )}

      {/* ═══ DETAIL MODAL ═══ */}
      <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="Query Details" size="xl">
        {selectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-surface-2 rounded-lg p-3">
                <p className="text-xs text-text-muted">Model</p>
                <p className="text-sm text-text-primary">{selectedLog.model?.name}</p>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <p className="text-xs text-text-muted">Tokens</p>
                <p className="text-sm font-mono text-text-primary">{formatTokens(selectedLog.totalTokens)}</p>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <p className="text-xs text-text-muted">You were charged</p>
                <p className="text-sm font-mono text-primary">{formatCurrency(selectedLog.customerPrice)}</p>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <p className="text-xs text-text-muted">Provider Cost</p>
                <p className="text-sm font-mono text-text-primary">{formatCurrency(selectedLog.providerCost)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-2 rounded-lg p-3">
                <p className="text-xs text-text-muted">Tokens In</p>
                <p className="text-sm font-mono text-text-primary">{formatTokens(selectedLog.tokensInput)}</p>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <p className="text-xs text-text-muted">Tokens Out</p>
                <p className="text-sm font-mono text-text-primary">{formatTokens(selectedLog.tokensOutput)}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-text-muted mb-1">Prompt</p>
              <div className="bg-surface-2 rounded-lg p-3 text-sm text-text-secondary max-h-40 overflow-y-auto whitespace-pre-wrap">
                {selectedLog.prompt || 'N/A'}
              </div>
            </div>
            {selectedLog.response && (
              <div>
                <p className="text-xs text-text-muted mb-1">Response</p>
                <div className="bg-surface-2 rounded-lg p-3 text-sm text-text-secondary max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {selectedLog.response}
                </div>
              </div>
            )}

            <div className="text-xs text-text-muted">
              {selectedLog.createdAt && `Timestamp: ${formatDateTime(selectedLog.createdAt)}`}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default UsagePage
