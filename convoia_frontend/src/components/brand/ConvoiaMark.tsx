import type { CSSProperties } from 'react'

type MarkState = 'idle' | 'thinking' | 'streaming' | 'council'

interface ConvoiaMarkProps {
  size?: number
  state?: MarkState
  color?: string
  style?: CSSProperties
  nodesOnly?: boolean
}

export function ConvoiaMark({
  size = 24,
  state = 'idle',
  color,
  style,
  nodesOnly = false,
}: ConvoiaMarkProps) {
  const nodeColor = color || 'var(--accent)'
  const lineColor = color || 'var(--accent)'

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={style}
      className={`convoia-mark convoia-mark--${state}`}
      aria-label="Convoia AI"
      role="img"
    >
      {!nodesOnly && (
        <g className="convoia-mark__lines">
          <line x1="6" y1="6" x2="18" y2="6" stroke={lineColor} strokeWidth="0.6" opacity="0.25" />
          <line x1="6" y1="6" x2="6" y2="18" stroke={lineColor} strokeWidth="0.6" opacity="0.25" />
          <line x1="18" y1="6" x2="18" y2="18" stroke={lineColor} strokeWidth="0.6" opacity="0.25" />
          <line x1="6" y1="18" x2="18" y2="18" stroke={lineColor} strokeWidth="0.6" opacity="0.25" />
          <line x1="6" y1="6" x2="18" y2="18" stroke={lineColor} strokeWidth="0.6" opacity="0.2" />
          <line x1="18" y1="6" x2="6" y2="18" stroke={lineColor} strokeWidth="0.6" opacity="0.2" />
        </g>
      )}
      <g className="convoia-mark__nodes">
        <circle cx="6" cy="6" r="1.8" fill={nodeColor} />
        <circle cx="18" cy="6" r="1.8" fill={nodeColor} />
        <circle cx="18" cy="18" r="1.8" fill={nodeColor} />
        <circle cx="6" cy="18" r="1.8" fill={nodeColor} />
      </g>
    </svg>
  )
}
