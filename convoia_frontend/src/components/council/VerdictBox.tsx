import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

interface Props {
  verdict: string
  isStreaming: boolean
  agreementLevel: { text: string; color: 'green' | 'amber' }
}

const PURPLE = '#7C3AED'

export function VerdictBox({ verdict, isStreaming, agreementLevel }: Props) {
  const badgeColor = agreementLevel.color === 'green' ? '#22C55E' : '#F59E0B'
  const badgeBg = agreementLevel.color === 'green' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)'

  return (
    <div
      style={{
        margin: '12px 0',
        padding: '14px 16px',
        borderRadius: '14px',
        border: '1px solid rgba(124,58,237,0.22)',
        background: 'var(--color-surface, var(--chat-surface, #fff))',
        boxShadow: '0 2px 12px rgba(124,58,237,0.05)',
      }}
    >
      <style>{`
        @keyframes council-cursor-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .v-text, .v-bullet, .v-section { font-size: 14px; line-height: 1.65; color: var(--chat-text, var(--color-text-primary)); }
        .v-bullet { margin: 4px 0 4px 14px; position: relative; }
        .v-bullet::before { content: '•'; color: ${PURPLE}; position: absolute; left: -12px; font-weight: 700; }
        .v-section { font-weight: 700; margin-top: 10px; margin-bottom: 4px; }
        .v-strong { font-weight: 700; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: 26, height: 26, borderRadius: '8px',
          background: `linear-gradient(135deg, ${PURPLE}, #5B21B6)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 800, fontSize: '13px',
        }}>C</div>
        <div style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: 'var(--chat-text, var(--color-text-primary))' }}>
          ConvoiaAI Council
        </div>
        <div style={{
          fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '100px',
          background: badgeBg, color: badgeColor, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {agreementLevel.text}
        </div>
      </div>

      <div style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--chat-text, var(--color-text-primary))' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{verdict}</ReactMarkdown>
        {isStreaming && (
          <span
            style={{
              display: 'inline-block', width: 2, height: 14, marginLeft: 2,
              background: PURPLE, verticalAlign: 'text-bottom',
              animation: 'council-cursor-pulse 0.8s ease-in-out infinite',
            }}
          />
        )}
      </div>
    </div>
  )
}

export function getAgreementLevel(verdict: string): { text: string; color: 'green' | 'amber' } {
  const lower = verdict.toLowerCase()
  const agree = ['all models agree', 'all three agree', 'consensus', 'converge on', 'unanimously', 'strong agreement', 'models aligned']
  const disagree = ['diverged', 'disagreed', 'split', 'mixed views', 'no consensus', 'conflicting']
  const agreeScore = agree.filter((s) => lower.includes(s)).length
  const disagreeScore = disagree.filter((s) => lower.includes(s)).length
  if (agreeScore > disagreeScore) return { text: 'High agreement', color: 'green' }
  return { text: 'Mixed views', color: 'amber' }
}
