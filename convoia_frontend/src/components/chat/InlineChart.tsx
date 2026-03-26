import { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { BarChart3, TrendingUp, PieChart as PieIcon, Maximize2, Minimize2 } from 'lucide-react'

interface ChartData {
  type: 'line' | 'bar' | 'area' | 'pie'
  title: string
  data: Record<string, any>[]
  xKey: string
  yKeys: { key: string; color: string; label: string }[]
}

const COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#06B6D4', '#8B5CF6']

/**
 * Parse chart blocks from AI response text.
 * Format: ```chart\n{json}\n```
 */
/**
 * Sanitize chart data — convert string values to numbers.
 * Handles: "$574.8B" → 574.8, "1,234" → 1234, "45%" → 45, "~$116B+" → 116
 */
function sanitizeChartData(data: Record<string, any>[], yKeys: { key: string }[]): Record<string, any>[] {
  const numericKeys = new Set(yKeys.map(yk => yk.key))
  return data.map(row => {
    const clean: Record<string, any> = { ...row }
    for (const key of numericKeys) {
      if (key in clean && typeof clean[key] !== 'number') {
        const str = String(clean[key])
        // Strip $, ~, +, commas, spaces
        let num = str.replace(/[$~+,\s]/g, '')
        // Handle B (billions), M (millions), K (thousands), T (trillions)
        let multiplier = 1
        if (/[Tt]$/i.test(num)) { multiplier = 1000; num = num.replace(/[Tt]$/i, '') }
        else if (/[Bb]$/i.test(num)) { multiplier = 1; num = num.replace(/[Bb]$/i, '') }
        else if (/[Mm]$/i.test(num)) { multiplier = 1; num = num.replace(/[Mm]$/i, '') }
        else if (/[Kk]$/i.test(num)) { multiplier = 0.001; num = num.replace(/[Kk]$/i, '') }
        // Remove % sign
        num = num.replace(/%$/, '')
        const parsed = parseFloat(num)
        if (!isNaN(parsed)) {
          clean[key] = parsed * multiplier
        } else {
          clean[key] = 0
        }
      }
    }
    return clean
  })
}

export function extractCharts(text: string): { cleanText: string; charts: ChartData[] } {
  const charts: ChartData[] = []
  const cleanText = text.replace(/```chart\n([\s\S]*?)```/g, (_match, json) => {
    try {
      const parsed = JSON.parse(json.trim())
      if (parsed.type && parsed.data && Array.isArray(parsed.data)) {
        const yKeys = parsed.yKeys || Object.keys(parsed.data[0] || {}).slice(1).map((k: string, i: number) => ({
          key: k, color: COLORS[i % COLORS.length], label: k,
        }))
        charts.push({
          type: parsed.type || 'line',
          title: parsed.title || 'Chart',
          data: sanitizeChartData(parsed.data, yKeys),
          xKey: parsed.xKey || Object.keys(parsed.data[0] || {})[0] || 'name',
          yKeys,
        })
        return '' // Remove chart block from text
      }
    } catch { /* invalid json, leave as-is */ }
    return _match
  })

  return { cleanText: cleanText.trim(), charts }
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
      borderRadius: '10px', padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    }}>
      <p style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginBottom: '6px', fontWeight: 600 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} />
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{p.name}:</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function InlineChart({ chart }: { chart: ChartData }) {
  const [expanded, setExpanded] = useState(false)
  const height = expanded ? 400 : 280

  // Debug: log chart data in development
  if (typeof window !== 'undefined' && (window as any).__DEV_CHART_DEBUG) {
    console.log('Chart render:', chart.title, chart.data)
  }

  // Validate: ensure we have at least 1 row with numeric data
  const hasNumericData = chart.data.some(row =>
    chart.yKeys.some(yk => typeof row[yk.key] === 'number' && row[yk.key] > 0)
  )
  if (!hasNumericData && chart.data.length > 0) {
    // Try re-sanitizing as last resort
    chart.data = sanitizeChartData(chart.data, chart.yKeys)
  }

  const chartIcon = chart.type === 'bar' ? <BarChart3 size={14} />
    : chart.type === 'pie' ? <PieIcon size={14} />
    : <TrendingUp size={14} />

  const axisStyle = { fontSize: '11px', fill: 'var(--color-text-dim)' }

  return (
    <div style={{
      margin: '16px 0', borderRadius: '14px', overflow: 'hidden',
      background: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--chat-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #7C3AED20, #10B98120)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-primary)',
          }}>{chartIcon}</div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{chart.title}</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-dim)', padding: '4px',
          }}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* Chart */}
      <div style={{ padding: '16px', transition: 'height 0.3s ease' }}>
        <ResponsiveContainer width="100%" height={height}>
          {chart.type === 'pie' ? (
            <PieChart>
              <Pie
                data={chart.data}
                dataKey={chart.yKeys[0]?.key || 'value'}
                nameKey={chart.xKey}
                cx="50%" cy="50%"
                outerRadius={height * 0.35}
                innerRadius={height * 0.18}
                paddingAngle={2}
                stroke="none"
              >
                {chart.data.map((_entry, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                formatter={(value: string) => <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{value}</span>}
              />
            </PieChart>
          ) : chart.type === 'bar' ? (
            <BarChart data={chart.data} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chat-border)" vertical={false} />
              <XAxis dataKey={chart.xKey} tick={axisStyle} axisLine={{ stroke: 'var(--chat-border)' }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={60} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v >= 1 ? v.toFixed(0) : v.toString()} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(value: string) => <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{value}</span>} />
              {chart.yKeys.map((yk) => (
                <Bar key={yk.key} dataKey={yk.key} name={yk.label} fill={yk.color} radius={[6, 6, 0, 0]} maxBarSize={60} />
              ))}
            </BarChart>
          ) : chart.type === 'area' ? (
            <AreaChart data={chart.data}>
              <defs>
                {chart.yKeys.map((yk) => (
                  <linearGradient key={yk.key} id={`gradient-${yk.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={yk.color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={yk.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chat-border)" vertical={false} />
              <XAxis dataKey={chart.xKey} tick={axisStyle} axisLine={{ stroke: 'var(--chat-border)' }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(value: string) => <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{value}</span>} />
              {chart.yKeys.map((yk) => (
                <Area key={yk.key} type="monotone" dataKey={yk.key} name={yk.label}
                  stroke={yk.color} strokeWidth={2} fill={`url(#gradient-${yk.key})`} />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chat-border)" vertical={false} />
              <XAxis dataKey={chart.xKey} tick={axisStyle} axisLine={{ stroke: 'var(--chat-border)' }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(value: string) => <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{value}</span>} />
              {chart.yKeys.map((yk) => (
                <Line key={yk.key} type="monotone" dataKey={yk.key} name={yk.label}
                  stroke={yk.color} strokeWidth={2.5} dot={{ fill: yk.color, r: 3 }}
                  activeDot={{ r: 5, fill: yk.color, stroke: 'var(--chat-surface)', strokeWidth: 2 }} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
