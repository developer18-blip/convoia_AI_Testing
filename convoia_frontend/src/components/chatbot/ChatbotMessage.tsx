import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles } from 'lucide-react'
import { ChatbotCTACard } from './ChatbotCTACard'
import { parseAssistantMessage, resolveActionRoute } from '../../hooks/useChatbot'
import type { ChatbotMessage as MsgType } from '../../hooks/useChatbot'

interface ChatbotMessageProps {
  message: MsgType
  onFollowupClick: (question: string) => void
  onCtaNavigate: (route: string) => void
}

function formatCost(cost?: number): string | null {
  if (cost == null || cost === 0) return null
  if (cost < 0.0001) return `<$0.0001`
  return `$${cost.toFixed(4)}`
}

/**
 * Renders one chat turn — user bubble (plain text, right-aligned)
 * or assistant bubble (markdown + parsed CTA + follow-up chips + cost footer).
 */
function ChatbotMessageBase({ message, onFollowupClick, onCtaNavigate }: ChatbotMessageProps) {
  const isUser = message.role === 'user'

  // Parse assistant CTAs/follow-ups out of the body. We re-parse on every
  // chunk while streaming, but the regex is cheap and the string is small,
  // so memoization on content is enough.
  const parsed = useMemo(
    () => (isUser ? null : parseAssistantMessage(message.content)),
    [isUser, message.content],
  )

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 4,
        }}
      >
        <div
          style={{
            maxWidth: '85%',
            padding: '8px 13px',
            background: 'var(--color-primary, #14B8CD)',
            color: 'var(--provider-on, #ffffff)',
            borderRadius: '14px 14px 4px 14px',
            fontSize: 14,
            lineHeight: 1.45,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.content}
        </div>
      </motion.div>
    )
  }

  // Assistant message
  const body = parsed?.body ?? message.content
  const cta = parsed?.cta ?? null
  const followups = parsed?.followups ?? []
  const costStr = formatCost(message.cost)
  const showFooter = !message.isStreaming && (costStr || message.outputTokens || message.model)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'flex-start' }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--color-primary, #14B8CD)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--provider-on, #ffffff)',
          marginTop: 2,
          boxShadow: '0 0 0 2px var(--color-primary-glow)',
        }}
      >
        <Sparkles size={12} strokeWidth={2.5} />
      </div>
      <div style={{ minWidth: 0, flex: 1, maxWidth: 'calc(100% - 32px)' }}>
        <div
          style={{
            padding: '10px 13px',
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '14px 14px 14px 4px',
            fontSize: 14,
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
          className="chatbot-md"
        >
          {body ? (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              {message.isStreaming && (
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 14,
                    marginLeft: 2,
                    background: 'var(--color-primary, #14B8CD)',
                    verticalAlign: 'text-bottom',
                    animation: 'chatbot-blink 1s steps(2) infinite',
                  }}
                />
              )}
            </>
          ) : message.isStreaming ? (
            <ChatbotTypingDots />
          ) : null}

          {cta && !message.isStreaming && (
            <ChatbotCTACard
              cta={cta}
              onClick={() => {
                const route = resolveActionRoute(cta.actionId)
                if (route) onCtaNavigate(route)
              }}
            />
          )}
        </div>

        {/* Cost transparency footer */}
        {showFooter && (
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color: 'var(--color-text-meta)',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              letterSpacing: 0.2,
              opacity: 0.7,
            }}
          >
            {costStr && <span>{costStr}</span>}
            {costStr && message.model && <span> · </span>}
            {message.model && <span>{message.model}</span>}
            {message.outputTokens != null && (
              <>
                <span> · </span>
                <span>{message.outputTokens} tok</span>
              </>
            )}
          </div>
        )}

        {/* Smart follow-up chips */}
        {followups.length > 0 && !message.isStreaming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.2 }}
            style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}
          >
            {followups.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowupClick(q)}
                style={{
                  padding: '5px 10px',
                  fontSize: 12,
                  background: 'transparent',
                  color: 'var(--color-primary, #14B8CD)',
                  border: '1px solid var(--color-primary-glow)',
                  borderRadius: 999,
                  cursor: 'pointer',
                  transition: 'background 100ms ease, border-color 100ms ease',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-primary-light)'
                  e.currentTarget.style.borderColor = 'var(--color-primary, #14B8CD)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'var(--color-primary-glow)'
                }}
              >
                {q}
              </button>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

function ChatbotTypingDots() {
  return (
    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', height: 18 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--color-primary, #14B8CD)',
            opacity: 0.5,
            animation: `chatbot-typing 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

export const ChatbotMessage = memo(ChatbotMessageBase)
