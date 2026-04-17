import { Sparkles } from 'lucide-react'
import type { CouncilMeta } from '../../types'

interface Props {
  meta: CouncilMeta
}

export function CouncilFooter({ meta }: Props) {
  const seconds = meta.totalDurationMs ? (meta.totalDurationMs / 1000).toFixed(1) : null
  return (
    <div
      style={{
        marginTop: '10px',
        padding: '8px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: '11px',
        color: 'var(--chat-text-muted, var(--color-text-muted))',
        borderTop: '1px solid var(--color-border, var(--chat-border))',
      }}
    >
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {meta.totalTokens.toLocaleString()} tokens · ${Number(meta.totalCost).toFixed(4)}{seconds ? ` · ${seconds}s` : ''}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Sparkles size={11} style={{ color: '#7C3AED' }} />
        Moderated by ConvoiaAI
      </span>
    </div>
  )
}
