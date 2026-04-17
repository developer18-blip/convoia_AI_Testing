import { Zap } from 'lucide-react'

interface Props {
  active: boolean
  count: number
  onClick: () => void
  variant?: 'mobile' | 'desktop'
}

export function CouncilChip({ active, count, onClick, variant = 'mobile' }: Props) {
  const isMobile = variant === 'mobile'
  const label = count > 0 ? `Council (${count})` : 'Council'

  return (
    <button
      onClick={onClick}
      title="LLM Council — multi-model consensus"
      style={{
        padding: isMobile ? '6px 12px' : '5px 12px',
        borderRadius: '100px',
        fontSize: isMobile ? '11px' : '12px',
        fontWeight: 700,
        border: active ? '1.5px solid #F59E0B' : '1px solid var(--color-border, var(--chat-border))',
        background: active
          ? 'linear-gradient(135deg, #F59E0B, #D97706)'
          : 'var(--color-surface, var(--chat-surface))',
        color: active ? 'white' : 'var(--color-text-muted, var(--chat-text-muted))',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        transition: 'all 150ms',
      }}
    >
      <Zap size={isMobile ? 11 : 12} fill={active ? 'white' : 'none'} />
      {label}
    </button>
  )
}
