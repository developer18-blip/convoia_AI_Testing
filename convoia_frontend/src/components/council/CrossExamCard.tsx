import { useEffect, useState } from 'react'

interface Props {
  phase: 'active' | 'complete'
  status: string
  durationMs: number
  modelsAnalyzed: number
  startTime?: number
}

export function CrossExamCard({ phase, status, durationMs, modelsAnalyzed, startTime }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const isActive = phase === 'active'

  useEffect(() => {
    if (!isActive || !startTime) return
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(id)
  }, [isActive, startTime])

  const displayTime = isActive
    ? `${(elapsed / 1000).toFixed(1)}s…`
    : `${(durationMs / 1000).toFixed(1)}s`

  const cardClass = isActive
    ? 'council-crossexam-card council-crossexam-card--active'
    : 'council-crossexam-card council-crossexam-card--complete'

  const iconClass = isActive
    ? 'council-exec-icon'
    : 'council-exec-icon council-exec-icon--complete'

  return (
    <div className={cardClass}>
      <div className={iconClass} style={isActive ? { background: 'var(--council-purple-bg)' } : undefined}>
        {isActive
          ? <span className="council-spinner council-spinner--purple" />
          : <span className="council-check">✓</span>}
      </div>
      <div className="council-exec-body">
        <div className={`council-crossexam-name council-crossexam-name--${isActive ? 'active' : 'complete'}`}>
          ConvoiaAI
        </div>
        <div className="council-exec-status" style={{ color: isActive ? 'var(--council-purple-light)' : 'var(--council-green)' }}>
          {isActive ? status : `${modelsAnalyzed} models analyzed in ${displayTime}`}
        </div>
      </div>
      {isActive && <div className="council-exec-time">{displayTime}</div>}
    </div>
  )
}
