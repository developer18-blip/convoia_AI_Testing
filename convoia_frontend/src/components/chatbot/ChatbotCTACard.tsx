import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { ParsedCTA } from '../../hooks/useChatbot'

interface ChatbotCTACardProps {
  cta: ParsedCTA
  onClick: () => void
}

/**
 * Inline action card rendered inside an assistant message bubble.
 * The bot emits `[CTA:action_id:Label]` markers; the parser pulls them out
 * and the widget renders this card right below the message body.
 */
export function ChatbotCTACard({ cta, onClick }: ChatbotCTACardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.2 }}
      onClick={onClick}
      style={{
        marginTop: 10,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 14px',
        background: 'var(--color-primary, #14B8CD)',
        color: 'var(--provider-on, #ffffff)',
        border: 'none',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1), 0 0 0 1px var(--color-primary-hover)',
        transition: 'transform 80ms ease, box-shadow 120ms ease',
      }}
      whileHover={{ y: -1, boxShadow: '0 4px 12px var(--color-primary-glow)' }}
      whileTap={{ y: 0 }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cta.label}</span>
      <ArrowRight size={15} strokeWidth={2.5} style={{ flexShrink: 0 }} />
    </motion.button>
  )
}
