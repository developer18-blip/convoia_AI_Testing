import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface AreaChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKey: string
  color?: string
  height?: number
  formatY?: (value: number) => string
}

export function AreaChart({
  data,
  xKey,
  yKey,
  color = '#7C3AED',
  height = 300,
  formatY,
}: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id={`gradient-${yKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey={xKey} stroke="#64748B" tick={{ fontSize: 12 }} />
        <YAxis stroke="#64748B" tick={{ fontSize: 12 }} tickFormatter={formatY} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            color: 'var(--color-text-primary)',
            fontSize: '13px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          }}
          labelStyle={{
            color: 'var(--color-text-primary)',
            fontWeight: 600,
            marginBottom: '4px',
          }}
          itemStyle={{
            color: 'var(--color-text-primary)',
          }}
          cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={color}
          strokeWidth={2}
          fillOpacity={1}
          fill={`url(#gradient-${yKey})`}
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}
