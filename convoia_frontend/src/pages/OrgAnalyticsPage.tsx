import { useEffect, useState, useMemo } from 'react'
import { Download, Calendar, DollarSign, MessageSquare, Zap, Users, Brain, TrendingUp, BarChart3 } from 'lucide-react'
import { AreaChart } from '../components/charts/AreaChart'
import { DonutChart } from '../components/charts/DonutChart'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'
import {
  BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Helpers ──
function fmt$(v: number) { return `$${v.toFixed(2)}` }
function fmtK(v: number) { return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(v) }
function dateStr(d: Date) { return d.toISOString().split('T')[0] }

const PRESET_RANGES = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const

// ── Stat Card ──
function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      background: 'var(--color-surface)', borderRadius: '16px', padding: '20px 24px',
      border: '1px solid var(--color-border)', display: 'flex', alignItems: 'flex-start', gap: '16px',
      flex: '1 1 0', minWidth: '180px',
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '12px',
        background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-dim)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '2px', lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Section Card ──
function Section({ title, icon: Icon, children, full }: { title: string; icon?: any; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{
      background: 'var(--color-surface)', borderRadius: '16px', padding: '24px',
      border: '1px solid var(--color-border)', gridColumn: full ? '1 / -1' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        {Icon && <Icon size={16} style={{ color: 'var(--color-primary)' }} />}
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ── Member Table ──
function MemberTable({ data }: { data: Array<{ name: string; cost: number; queries: number; tokens: number }> }) {
  if (!data.length) return <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', padding: '32px 0' }}>No member data</p>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            {['Member', 'Queries', 'Tokens', 'Cost'].map(h => (
              <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Member' ? 'left' : 'right', color: 'var(--color-text-dim)', fontWeight: 500, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((m, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '12px', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `hsl(${i * 47}, 60%, 50%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 600 }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  {m.name}
                </div>
              </td>
              <td style={{ padding: '12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{m.queries.toLocaleString()}</td>
              <td style={{ padding: '12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{fmtK(m.tokens)}</td>
              <td style={{ padding: '12px', textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: 600 }}>{fmt$(m.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Export to CSV ──
function exportCSV(data: any, dateRange: string) {
  const rows: string[][] = [['ConvoiaAI Analytics Report', '', '', ''], ['Date Range:', dateRange, '', ''], []]

  // Daily usage
  rows.push(['--- Daily Usage ---'])
  rows.push(['Date', 'Cost ($)', 'Queries', 'Tokens'])
  for (const d of data.dailyUsage || []) rows.push([d.date, d.cost.toFixed(4), String(d.queries), String(d.tokens)])
  rows.push([])

  // Member breakdown (org only)
  if (data.memberBreakdown) {
    rows.push(['--- Member Breakdown ---'])
    rows.push(['Member', 'Cost ($)', 'Queries', 'Tokens'])
    for (const m of data.memberBreakdown) rows.push([m.name, m.cost.toFixed(4), String(m.queries), String(m.tokens)])
    rows.push([])
  }

  // Model breakdown
  rows.push(['--- Model Breakdown ---'])
  rows.push(['Model', 'Cost ($)', 'Queries', 'Tokens'])
  for (const m of data.modelBreakdown || []) rows.push([m.name, m.cost.toFixed(4), String(m.queries), String(m.tokens)])

  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `convoia-analytics-${dateRange.replace(/\s/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main Component ──
export function OrgAnalyticsPage() {
  const { user } = useAuth()
  const role = user?.role || 'user'
  const isOrg = ['org_owner', 'manager', 'platform_admin'].includes(role)

  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeDays, setActiveDays] = useState(30)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [chartMode, setChartMode] = useState<'cost' | 'queries'>('cost')

  const fromDate = useMemo(() => {
    if (customFrom) return customFrom
    const d = new Date(); d.setDate(d.getDate() - activeDays)
    return dateStr(d)
  }, [activeDays, customFrom])

  const toDate = useMemo(() => customTo || dateStr(new Date()), [customTo])

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    const endpoint = isOrg ? '/org/analytics' : '/org/analytics/personal'
    api.get(endpoint, { params: { from: fromDate, to: toDate } })
      .then((res) => setData(res.data.data))
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setIsLoading(false))
  }, [fromDate, toDate, isOrg])

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />

  const summary = data?.summary || {}
  const dailyData = data?.dailyUsage || []
  const memberData = data?.memberBreakdown || []
  const modelData = (data?.modelBreakdown || []).map((m: any) => ({ name: m.name, value: m.cost }))
  const dateRangeLabel = `${fromDate} to ${toDate}`

  // Queries bar chart data (top 7 days)
  const queryBarData = [...dailyData].sort((a: any, b: any) => b.queries - a.queries).slice(0, 10)

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 8px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {isOrg ? 'Organization Analytics' : 'My Analytics'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            {isOrg ? 'Track your team\'s AI usage and spending' : 'Track your AI usage and spending'}
          </p>
        </div>
        <button
          onClick={() => exportCSV(data, dateRangeLabel)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            borderRadius: '10px', border: '1px solid var(--color-border)',
            background: 'var(--color-surface)', color: 'var(--color-text-primary)',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
        >
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* ── Date Range Picker ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', flexWrap: 'wrap',
        background: 'var(--color-surface)', borderRadius: '12px', padding: '12px 16px',
        border: '1px solid var(--color-border)',
      }}>
        <Calendar size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        {PRESET_RANGES.map(r => (
          <button key={r.days} onClick={() => { setActiveDays(r.days); setCustomFrom(''); setCustomTo('') }}
            style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
              border: 'none', cursor: 'pointer', transition: 'all 150ms',
              background: activeDays === r.days && !customFrom ? 'var(--color-primary)' : 'transparent',
              color: activeDays === r.days && !customFrom ? 'white' : 'var(--color-text-secondary)',
            }}>
            {r.label}
          </button>
        ))}
        <div style={{ width: '1px', height: '24px', background: 'var(--color-border)', margin: '0 4px' }} />
        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', fontSize: '12px' }} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>to</span>
        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', fontSize: '12px' }} />
      </div>

      {/* ── Summary Stats ── */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <StatCard icon={DollarSign} label="Total Spend" value={fmt$(summary.totalCost || 0)} sub={`Avg ${fmt$(summary.avgCostPerQuery || 0)}/query`} color="#7C3AED" />
        <StatCard icon={MessageSquare} label="Total Queries" value={fmtK(summary.totalQueries || 0)} color="#3B82F6" />
        <StatCard icon={Zap} label="Tokens Used" value={fmtK(summary.totalTokens || 0)} color="#F59E0B" />
        {isOrg && <StatCard icon={Users} label="Active Members" value={String(summary.activeMembers || 0)} color="#10B981" />}
        <StatCard icon={Brain} label="Models Used" value={String(summary.modelsUsed || 0)} color="#EC4899" />
      </div>

      {/* ── Charts Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

        {/* Daily Spend / Queries chart — full width */}
        <Section title={chartMode === 'cost' ? 'Daily Spend' : 'Daily Queries'} icon={TrendingUp} full>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
            {(['cost', 'queries'] as const).map(m => (
              <button key={m} onClick={() => setChartMode(m)}
                style={{
                  padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 500, border: 'none', cursor: 'pointer',
                  background: chartMode === m ? 'var(--color-primary)' : 'transparent',
                  color: chartMode === m ? 'white' : 'var(--color-text-muted)',
                }}>
                {m === 'cost' ? 'Spend ($)' : 'Queries'}
              </button>
            ))}
          </div>
          {dailyData.length > 0 ? (
            <AreaChart
              data={dailyData} xKey="date"
              yKey={chartMode}
              height={280}
              color={chartMode === 'cost' ? '#7C3AED' : '#3B82F6'}
              formatY={chartMode === 'cost' ? (v: number) => fmt$(v) : (v: number) => fmtK(v)}
            />
          ) : <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>No data for this period</div>}
        </Section>

        {/* Model Breakdown */}
        <Section title="Usage by Model" icon={Brain}>
          {modelData.length > 0 ? <DonutChart data={modelData} /> : <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', padding: '32px 0' }}>No data</p>}
        </Section>

        {/* Top Days bar chart */}
        <Section title="Busiest Days" icon={BarChart3}>
          {queryBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <RechartsBarChart data={queryBarData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="#64748B" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748B" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '13px' }} />
                <Bar dataKey="queries" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </RechartsBarChart>
            </ResponsiveContainer>
          ) : <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', padding: '32px 0' }}>No data</p>}
        </Section>

        {/* Member Breakdown (org only) or Model table (personal) */}
        {isOrg && (
          <Section title="Usage by Member" icon={Users}>
            {memberData.length > 0 ? (
              <DonutChart data={memberData.map((m: any) => ({ name: m.name, value: m.cost }))} />
            ) : <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', padding: '32px 0' }}>No data</p>}
          </Section>
        )}
      </div>

      {/* ── Member Details Table (org only) ── */}
      {isOrg && memberData.length > 0 && (
        <Section title="Member Details" icon={Users} full>
          <MemberTable data={memberData} />
        </Section>
      )}
    </div>
  )
}

export default OrgAnalyticsPage
