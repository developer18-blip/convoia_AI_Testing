interface ComputationLineProps {
  label?: string
  maxWidth?: number
  council?: boolean
}

export function ComputationLine({ label, maxWidth = 160, council = false }: ComputationLineProps) {
  return (
    <div className="comp-line-wrap">
      <div className="comp-line" style={{ maxWidth }}>
        <div className={`comp-line__pulse ${council ? 'comp-line__pulse--council' : ''}`} />
      </div>
      {label && <div className="comp-line__label mono-label">{label}</div>}
    </div>
  )
}
