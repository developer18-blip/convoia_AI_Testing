import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { CouncilModelResponse } from '../../types'

interface Props {
  resp: CouncilModelResponse
}

export function ResponsePanel({ resp }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div
      style={{
        margin: '4px 0',
        borderRadius: '10px',
        border: '1px solid var(--color-border, var(--chat-border))',
        overflow: 'hidden',
        background: 'var(--color-surface, var(--chat-surface))',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', padding: '10px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none',
          background: 'var(--color-surface-2, rgba(0,0,0,0.02))',
          border: 'none',
          color: 'var(--chat-text, var(--color-text-primary))',
          fontSize: '12px', fontWeight: 600,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, textAlign: 'left' }}>
          {resp.name}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--chat-text-muted)', marginRight: 8, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>
          {(resp.durationMs / 1000).toFixed(1)}s · {resp.tokens.toLocaleString()} tokens
        </span>
        <ChevronDown
          size={14}
          style={{ color: 'var(--chat-text-muted)', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 180ms ease' }}
        />
      </button>
      {open && (
        <div
          style={{
            padding: '10px 12px',
            fontSize: '12px', lineHeight: 1.65,
            color: 'var(--chat-text-secondary, var(--color-text-secondary))',
            borderTop: '1px solid var(--color-border, var(--chat-border))',
            maxHeight: '280px', overflowY: 'auto',
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{resp.response}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
