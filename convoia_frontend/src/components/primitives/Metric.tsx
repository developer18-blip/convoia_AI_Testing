interface MetricProps {
  label: string
  value: string | number
  unit?: string
  sublabel?: string
  accent?: boolean
}

export function Metric({ label, value, unit, sublabel, accent }: MetricProps) {
  return (
    <div className="metric">
      <div className="metric__label mono-label">{label}</div>
      <div className={`metric__value mono-value ${accent ? 'metric__value--accent' : ''}`}>
        {value}
        {unit && <span className="metric__unit">{unit}</span>}
      </div>
      {sublabel && <div className="metric__sublabel">{sublabel}</div>}
    </div>
  )
}
