import { CSSProperties } from 'react'

type MarkState = 'idle' | 'thinking' | 'streaming' | 'council'

interface IntellectMarkProps {
  size?: number
  state?: MarkState
  color?: string
  style?: CSSProperties
  nodesOnly?: boolean
}

export function IntellectMark({
  size = 24,
  state = 'idle',
  color,
  style,
  nodesOnly = false,
}: IntellectMarkProps) {
  const nodeColor = color || 'var(--accent)'
  const lineColor = color || 'var(--accent)'

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={style}
      className={`intellect-mark intellect-mark--${state}`}
      aria-label="Intellect AI"
      role="img"
    >
      {!nodesOnly && (
        <g className="intellect-mark__lines">
          <line x1="6" y1="6" x2="18" y2="6" stroke={lineColor} strokeWidth="0.6" opacity="0.25" />
          <line x1="6" y1="6" x2="6" y2="18" stroke={lineColor} strokeWidth="0.6" opacity="0.25" />
          <line x1="18" y1="6" x2="18" y2="18" stroke={lineColor} strokeWidth="0.6" opacity="0.25" />
          <line x1="6" y1="18" x2="18" y2="18" stroke={lineColor} strokeWidth="0.6" opacity="0.25" />
          <line x1="6" y1="6" x2="18" y2="18" stroke={lineColor} strokeWidth="0.6" opacity="0.2" />
          <line x1="18" y1="6" x2="6" y2="18" stroke={lineColor} strokeWidth="0.6" opacity="0.2" />
        </g>
      )}
      <g className="intellect-mark__nodes">
        <circle cx="6" cy="6" r="1.8" fill={nodeColor} />
        <circle cx="18" cy="6" r="1.8" fill={nodeColor} />
        <circle cx="18" cy="18" r="1.8" fill={nodeColor} />
        <circle cx="6" cy="18" r="1.8" fill={nodeColor} />
      </g>
    </svg>
  )
}
