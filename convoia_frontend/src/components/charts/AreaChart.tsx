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
        <CartesianGrid strokeDasharray="3 3" stroke="#2D2D3F" />
        <XAxis dataKey={xKey} stroke="#64748B" tick={{ fontSize: 12 }} />
        <YAxis stroke="#64748B" tick={{ fontSize: 12 }} tickFormatter={formatY} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#111118',
            border: '1px solid #2D2D3F',
            borderRadius: '8px',
            color: '#F8F8FF',
            fontSize: '13px',
          }}
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
