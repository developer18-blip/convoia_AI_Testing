import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface LineChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKey: string
  yKey2?: string
  color?: string
  color2?: string
  height?: number
  formatY?: (value: number) => string
}

export function LineChart({
  data,
  xKey,
  yKey,
  yKey2,
  color = '#7C3AED',
  color2 = '#3B82F6',
  height = 300,
  formatY,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
        <Line
          type="monotone"
          dataKey={yKey}
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        {yKey2 && (
          <Line
            type="monotone"
            dataKey={yKey2}
            stroke={color2}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        )}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
