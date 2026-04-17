import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

interface Props {
  phase: 'active' | 'complete'
  status: string
  durationMs: number
  modelsAnalyzed: number
  startTime?: number
}

export function CrossExamCard({ phase, status, durationMs, modelsAnalyzed, startTime }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (phase !== 'active' || !startTime) return
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(id)
  }, [phase, startTime])

  const isActive = phase === 'active'
  const displayTime = isActive
    ? `${(elapsed / 1000).toFixed(1)}s…`
    : `${(durationMs / 1000).toFixed(1)}s`

  return (
    <div
      style={{
        margin: '10px 0 6px',
        padding: '12px 14px',
        borderRadius: '12px',
        border: isActive
          ? '1px solid rgba(124,58,237,0.35)'
          : '1px solid rgba(34,197,94,0.35)',
        background: isActive
          ? 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(91,33,182,0.03))'
          : 'var(--color-surface, var(--chat-surface))',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}
    >
      <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isActive ? <PurpleSpinner /> : (
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={13} color="white" strokeWidth={3} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED', marginBottom: '2px' }}>
          ConvoiaAI
        </div>
        <div style={{ fontSize: '12px', color: 'var(--chat-text-secondary, var(--color-text-secondary))', lineHeight: 1.4 }}>
          {isActive ? status : `${modelsAnalyzed} models analyzed in ${displayTime}`}
        </div>
      </div>
      {isActive && (
        <div style={{ fontSize: '11px', color: 'var(--chat-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {displayTime}
        </div>
      )}
    </div>
  )
}

function PurpleSpinner() {
  return (
    <>
      <style>{`@keyframes council-spin-purple { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: 20, height: 20, borderRadius: '50%',
          border: '2px solid rgba(124,58,237,0.15)',
          borderTopColor: '#7C3AED',
          animation: 'council-spin-purple 0.75s linear infinite',
        }}
      />
    </>
  )
}
