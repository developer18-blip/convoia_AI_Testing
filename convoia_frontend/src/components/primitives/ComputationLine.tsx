interface ComputationLineProps {
  label?: string
  maxWidth?: number
}

export function ComputationLine({ label, maxWidth = 160 }: ComputationLineProps) {
  return (
    <div className="comp-line-wrap">
      <div className="comp-line" style={{ maxWidth }}>
        <div className="comp-line__pulse" />
      </div>
      {label && <div className="comp-line__label mono-label">{label}</div>}
    </div>
  )
}
