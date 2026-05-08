import { useEffect, useRef, useState } from 'react'
import { Send, Square } from 'lucide-react'

interface ChatbotInputProps {
  onSend: (text: string) => void
  isStreaming: boolean
  /** Externally-set draft text (e.g., when a follow-up chip is clicked) */
  draft?: string
  onDraftConsumed?: () => void
}

const MAX_CHARS = 4000

export function ChatbotInput({ onSend, isStreaming, draft, onDraftConsumed }: ChatbotInputProps) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement | null>(null)

  // External draft injection (follow-up chip click → autosend)
  useEffect(() => {
    if (draft != null && draft.length > 0) {
      setText(draft)
      // Auto-send the suggested follow-up immediately
      onSend(draft)
      onDraftConsumed?.()
      setText('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const autoSize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`
  }

  useEffect(autoSize, [text])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setText('')
  }

  const overLimit = text.length > MAX_CHARS
  const showCounter = text.length > 300

  return (
    <div
      style={{
        padding: '10px 12px 12px',
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-surface)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          background: 'var(--color-surface-2)',
          border: `1px solid ${overLimit ? '#dc2626' : 'var(--color-border-subtle)'}`,
          borderRadius: 14,
          padding: '6px 6px 6px 12px',
          transition: 'border-color 120ms ease, box-shadow 120ms ease',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-primary, #14B8CD)'
          e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-glow)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = overLimit ? '#dc2626' : 'var(--color-border-subtle)'
          e.currentTarget.style.boxShadow = 'none'
        }}
        tabIndex={-1}
      >
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Ask about Convoia…"
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--color-text-primary)',
            fontSize: 14,
            lineHeight: 1.45,
            fontFamily: 'inherit',
            padding: '6px 0',
            maxHeight: 96,
            minHeight: 22,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || isStreaming || overLimit}
          aria-label={isStreaming ? 'Streaming' : 'Send message'}
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: 10,
            border: 'none',
            background: text.trim() && !isStreaming && !overLimit ? 'var(--color-primary, #14B8CD)' : 'var(--color-surface-3)',
            color: text.trim() && !isStreaming && !overLimit ? 'var(--provider-on, #ffffff)' : 'var(--color-text-muted)',
            cursor: text.trim() && !isStreaming && !overLimit ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 120ms ease, transform 80ms ease',
          }}
        >
          {isStreaming ? <Square size={12} strokeWidth={3} fill="currentColor" /> : <Send size={14} strokeWidth={2.2} />}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 6,
          fontSize: 10,
          color: 'var(--color-text-meta)',
          minHeight: 14,
        }}
      >
        <span style={{ opacity: 0.6 }}>Powered by Haiku 4.5 · Free for visitors</span>
        {showCounter && (
          <span style={{ color: overLimit ? '#dc2626' : 'var(--color-text-meta)' }}>
            {text.length}/{MAX_CHARS}
          </span>
        )}
      </div>
    </div>
  )
}
