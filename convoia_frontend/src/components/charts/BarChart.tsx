import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface BarChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKey: string
  color?: string
  height?: number
  formatY?: (value: number) => string
}

export function BarChart({
  data,
  xKey,
  yKey,
  color = '#7C3AED',
  height = 300,
  formatY,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
        <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
