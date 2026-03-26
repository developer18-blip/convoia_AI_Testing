import { useState, useRef, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { BarChart3, TrendingUp, PieChart as PieIcon, Maximize2, Minimize2 } from 'lucide-react'

/**
 * Hook to measure container width. Fixes Recharts ResponsiveContainer mobile bug.
 */
function useContainerWidth(defaultWidth = 400) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(defaultWidth)
  useEffect(() => {
    const measure = () => {
      if (ref.current) {
        const w = ref.current.getBoundingClientRect().width - 24 // subtract padding
        if (w > 50) setWidth(w)
      }
    }
    measure()
    const t1 = setTimeout(measure, 100)
    const t2 = setTimeout(measure, 500)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', measure) }
  }, [])
  return { ref, width }
}

interface ChartData {
  type: 'line' | 'bar' | 'area' | 'pie'
  title: string
  data: Record<string, any>[]
  xKey: string
  yKeys: { key: string; color: string; label: string }[]
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']

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

/**
 * Try to extract chart data from ASCII/text tables inside code blocks.
 * Matches patterns like "1. Apple     $383.3B" or "Apple | $383.3B"
 */
function extractChartFromTextTable(codeBlock: string): ChartData | null {
  const lines = codeBlock.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return null

  // Try to find lines with name + dollar/number pattern
  const dataRows: { name: string; value: number }[] = []
  let title = ''

  for (const line of lines) {
    // Match: "1. Apple     $383.3B" or "Apple  $383.3B" or "Apple | $383.3B"
    const match = line.match(/^\s*\d*\.?\s*([A-Za-z][\w\s/&.]+?)\s+[\|]?\s*\$?([\d,.]+)\s*([BMKTbmkt]?)/)
    if (match) {
      const name = match[1].trim()
      let val = parseFloat(match[2].replace(/,/g, ''))
      if (isNaN(val)) continue
      const suffix = match[3].toUpperCase()
      if (suffix === 'T') val *= 1000
      // B, M, K just keep as is for display
      dataRows.push({ name, value: val })
    } else if (!title && line.trim().length > 5 && !line.includes('$')) {
      title = line.trim().replace(/^[─═\-\|]+$/, '').trim()
    }
  }

  if (dataRows.length >= 2) {
    return {
      type: 'bar',
      title: title || 'Comparison',
      data: dataRows,
      xKey: 'name',
      yKeys: [{ key: 'value', color: COLORS[0], label: 'Value ($B)' }],
    }
  }
  return null
}

export function extractCharts(text: string): { cleanText: string; charts: ChartData[] } {
  const charts: ChartData[] = []
  let cleanText = text

  // 1. Try structured chart JSON blocks first
  cleanText = cleanText.replace(/```chart\s*\n([\s\S]*?)```/g, (_match, json) => {
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
        return ''
      }
    } catch { /* not valid JSON */ }
    return _match
  })

  // 2. Fallback: detect ASCII tables with $ values inside code blocks
  if (charts.length === 0) {
    cleanText = cleanText.replace(/```\w*\n([\s\S]*?)```/g, (_match, content) => {
      // Only try if content has $ signs and multiple lines
      if (content.includes('$') && content.split('\n').length >= 3) {
        const chart = extractChartFromTextTable(content)
        if (chart) {
          charts.push(chart)
          return '' // Remove the code block, chart replaces it
        }
      }
      return _match
    })
  }

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
  const { ref: containerRef, width: chartWidth } = useContainerWidth(400)

  // Always log chart data for debugging
  console.log('[InlineChart] Rendering:', chart.title, 'Type:', chart.type, 'Data:', JSON.stringify(chart.data), 'yKeys:', JSON.stringify(chart.yKeys))

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

  const axisStyle = { fontSize: '12px', fill: 'var(--color-text-secondary)', fontWeight: 500 }

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

      {/* Chart - use explicit dimensions to fix mobile rendering */}
      <div ref={containerRef} style={{ padding: '12px 8px', width: '100%' }}>
          {chart.type === 'pie' ? (
            <PieChart width={chartWidth} height={height}>
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
            <BarChart width={chartWidth} height={height} data={chart.data} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chat-border)" vertical={false} />
              <XAxis dataKey={chart.xKey} tick={{ ...axisStyle, fontSize: '11px' }} axisLine={{ stroke: 'var(--chat-border)' }} tickLine={false} interval={0} angle={chart.data.length > 5 ? -30 : 0} textAnchor={chart.data.length > 5 ? 'end' : 'middle'} height={chart.data.length > 5 ? 60 : 30} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={60} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v >= 1 ? v.toFixed(0) : v.toString()} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(value: string) => <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{value}</span>} />
              {chart.yKeys.map((yk) => (
                <Bar key={yk.key} dataKey={yk.key} name={yk.label} fill={yk.color} radius={[6, 6, 0, 0]} maxBarSize={60} />
              ))}
            </BarChart>
          ) : chart.type === 'area' ? (
            <AreaChart width={chartWidth} height={height} data={chart.data}>
              <defs>
                {chart.yKeys.map((yk) => (
                  <linearGradient key={yk.key} id={`gradient-${yk.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={yk.color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={yk.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chat-border)" vertical={false} />
              <XAxis dataKey={chart.xKey} tick={{ ...axisStyle, fontSize: '11px' }} axisLine={{ stroke: 'var(--chat-border)' }} tickLine={false} interval={0} angle={chart.data.length > 5 ? -30 : 0} textAnchor={chart.data.length > 5 ? 'end' : 'middle'} height={chart.data.length > 5 ? 60 : 30} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(value: string) => <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{value}</span>} />
              {chart.yKeys.map((yk) => (
                <Area key={yk.key} type="monotone" dataKey={yk.key} name={yk.label}
                  stroke={yk.color} strokeWidth={2} fill={`url(#gradient-${yk.key})`} />
              ))}
            </AreaChart>
          ) : (
            <LineChart width={chartWidth} height={height} data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chat-border)" vertical={false} />
              <XAxis dataKey={chart.xKey} tick={{ ...axisStyle, fontSize: '11px' }} axisLine={{ stroke: 'var(--chat-border)' }} tickLine={false} interval={0} angle={chart.data.length > 5 ? -30 : 0} textAnchor={chart.data.length > 5 ? 'end' : 'middle'} height={chart.data.length > 5 ? 60 : 30} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(value: string) => <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{value}</span>} />
              {chart.yKeys.map((yk) => (
                <Line key={yk.key} type="monotone" dataKey={yk.key} name={yk.label}
                  stroke={yk.color} strokeWidth={2.5} dot={{ fill: yk.color, r: 3 }}
                  activeDot={{ r: 5, fill: yk.color, stroke: 'var(--chat-surface)', strokeWidth: 2 }} />
              ))}
            </LineChart>
          )}
      </div>
    </div>
  )
}
