import { useEffect, useState } from 'react'
import type { CouncilModelState } from '../../types'

interface Props {
  model: CouncilModelState
  dimmed?: boolean
}

export function ModelStatusCard({ model, dimmed }: Props) {
  const { status, statusMessage, modelName, durationMs, tokenCount, error, startTime } = model
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (status !== 'thinking' || !startTime) return
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(id)
  }, [status, startTime])

  const displayTime = status === 'thinking'
    ? `${(elapsed / 1000).toFixed(1)}s…`
    : status === 'complete'
      ? `${(durationMs / 1000).toFixed(1)}s ✓`
      : status === 'error'
        ? 'Failed'
        : 'Queued'

  const cardClasses = [
    'council-exec-card',
    status === 'complete' ? 'council-exec-card--complete' : '',
    status === 'error' ? 'council-exec-card--error' : '',
    dimmed ? 'council-exec-card--dimmed' : '',
  ].filter(Boolean).join(' ')

  const iconClass = status === 'thinking'
    ? 'council-exec-icon council-exec-icon--thinking'
    : status === 'complete'
      ? 'council-exec-icon council-exec-icon--complete'
      : status === 'error'
        ? 'council-exec-icon council-exec-icon--error'
        : 'council-exec-icon'

  return (
    <div className={cardClasses}>
      <div className={iconClass}>
        {status === 'thinking' && <span className="council-spinner" />}
        {status === 'complete' && <span className="council-check">✓</span>}
        {status === 'error' && <span className="council-error-icon">×</span>}
        {status === 'waiting' && <span className="council-spinner" style={{ opacity: 0.4 }} />}
      </div>
      <div className="council-exec-body">
        <div className="council-exec-name">{modelName}</div>
        <div className={`council-exec-status council-exec-status--${status === 'waiting' ? 'thinking' : status}`}>
          {status === 'error'
            ? (error || 'Failed')
            : status === 'complete'
              ? `Analysis complete · ${tokenCount.toLocaleString()} tokens`
              : statusMessage || 'Queued…'}
        </div>
      </div>
      <div className={`council-exec-time ${status === 'complete' ? 'council-exec-time--complete' : ''}`}>
        {displayTime}
      </div>
    </div>
  )
}
