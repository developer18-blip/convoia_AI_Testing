import { useEffect, useState } from 'react'
import { Check, X as XIcon, Circle } from 'lucide-react'
import type { CouncilModelState } from '../../types'

interface Props {
  model: CouncilModelState
}

export function ModelStatusCard({ model }: Props) {
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

  const borderColor = status === 'complete'
    ? 'rgba(34,197,94,0.35)'
    : status === 'error'
      ? 'rgba(239,68,68,0.35)'
      : 'var(--color-border, var(--chat-border))'

  return (
    <div
      style={{
        margin: '6px 0',
        padding: '10px 12px',
        borderRadius: '10px',
        border: `1px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'var(--color-surface, var(--chat-surface, #fff))',
        transition: 'border-color 300ms ease',
      }}
    >
      <div style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {status === 'thinking' && <Spinner color="#F59E0B" />}
        {status === 'complete' && (
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={11} color="white" strokeWidth={3} />
          </div>
        )}
        {status === 'error' && (
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <XIcon size={11} color="white" strokeWidth={3} />
          </div>
        )}
        {status === 'waiting' && <Circle size={14} color="var(--chat-text-muted)" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--chat-text, var(--color-text-primary))', marginBottom: '2px' }}>
          {modelName}
        </div>
        <div style={{
          fontSize: '11px',
          color: status === 'error' ? '#EF4444' : 'var(--chat-text-muted, var(--color-text-muted))',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {status === 'error' ? (error || 'Failed') : status === 'complete' ? `Analysis complete · ${tokenCount.toLocaleString()} tokens` : statusMessage}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--chat-text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {displayTime}
      </div>
    </div>
  )
}

function Spinner({ color }: { color: string }) {
  return (
    <>
      <style>{`@keyframes council-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: 16, height: 16, borderRadius: '50%',
          border: '2px solid var(--color-border, rgba(0,0,0,0.1))',
          borderTopColor: color,
          animation: 'council-spin 0.75s linear infinite',
        }}
      />
    </>
  )
}
