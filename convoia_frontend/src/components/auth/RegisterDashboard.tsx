import { useEffect, useState } from 'react'
import { ConvoiaMark } from '../brand/ConvoiaMark'
import { PROVIDER_THEMES } from '../../config/providers'

/**
 * RegisterDashboard — interactive right-pane content for RegisterPage in
 * split-pane mode. Faux-dashboard preview that reacts to pointer:
 *   - Provider chips highlight in their own brand color on hover/click.
 *   - Chat preview types out word-by-word on mount, then loops.
 *   - Feature cards lift on hover.
 * All visual; no real API calls. Pointer-events enabled (the parent
 * .auth-layout__split-pane drops aria-hidden when interactive content
 * lives inside).
 */

const PREVIEW_PROVIDERS: (keyof typeof PROVIDER_THEMES)[] = [
  'anthropic', 'openai', 'google', 'xai', 'mistral', 'deepseek',
]

interface ChatLine {
  modelName: string
  text: string
}

const CHAT_LINES: ChatLine[] = [
  {
    modelName: 'Claude Sonnet 4.6',
    text: 'ConvoiaAI picked Claude Sonnet 4.6 for this question — best balance of accuracy and cost on long-form analysis.',
  },
  {
    modelName: 'GPT-5.4 Nano',
    text: 'Switching to GPT-5.4 Nano for the follow-up — same context, 8× cheaper.',
  },
  {
    modelName: 'Gemini 2.5 Flash',
    text: 'Routing this image-heavy task to Gemini 2.5 Flash — multimodal, sub-second response.',
  },
]

const TYPE_SPEED_MS = 18      // per-character interval
const PAUSE_BETWEEN_MS = 1700 // pause after a line completes before the next starts

/**
 * Tiny typewriter hook — types `target` character-by-character at TYPE_SPEED_MS,
 * holds the full line for PAUSE_BETWEEN_MS, then resolves so the caller can
 * advance to the next line. Resets cleanly on target change.
 */
function useTypewriter(target: string, onComplete: () => void) {
  const [shown, setShown] = useState('')
  useEffect(() => {
    setShown('')
    let i = 0
    const interval = setInterval(() => {
      i += 1
      setShown(target.slice(0, i))
      if (i >= target.length) {
        clearInterval(interval)
        const t = setTimeout(onComplete, PAUSE_BETWEEN_MS)
        return () => clearTimeout(t)
      }
    }, TYPE_SPEED_MS)
    return () => clearInterval(interval)
    // onComplete intentionally omitted — caller's setActiveLine is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return shown
}

export function RegisterDashboard() {
  const [activeProvider, setActiveProvider] = useState<keyof typeof PROVIDER_THEMES | null>(null)
  const [activeLine, setActiveLine] = useState(0)

  const current = CHAT_LINES[activeLine]
  const typed = useTypewriter(current.text, () => {
    setActiveLine((i) => (i + 1) % CHAT_LINES.length)
  })

  return (
    <div className="register-dashboard">
      <div className="register-dashboard__header">
        <span className="register-dashboard__eyebrow">Your workspace, day one</span>
        <h2 className="register-dashboard__title">Every frontier model, one billing line.</h2>
        <p className="register-dashboard__subtitle">
          Sign up in under a minute and route your first query across 40+ models — no separate provider accounts, no per-model contracts.
        </p>
      </div>

      {/* Faux model-picker panel. Hover/click any chip to see its brand
          tint take over — communicates "you have access to all of these". */}
      <div className="register-dashboard__panel">
        <div className="register-dashboard__panel-head">
          <span className="register-dashboard__panel-title">Model router</span>
          <span className="mono-label" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            HOVER TO PREVIEW
          </span>
        </div>
        <div className="register-dashboard__model-row">
          {PREVIEW_PROVIDERS.map((key) => {
            const theme = PROVIDER_THEMES[key]
            const isActive = activeProvider === key
            return (
              <button
                key={key}
                type="button"
                className={'register-dashboard__model-chip' + (isActive ? ' register-dashboard__model-chip--active' : '')}
                onMouseEnter={() => setActiveProvider(key)}
                onMouseLeave={() => setActiveProvider(null)}
                onFocus={() => setActiveProvider(key)}
                onBlur={() => setActiveProvider(null)}
                onClick={(e) => { e.preventDefault(); setActiveProvider(isActive ? null : key) }}
                style={isActive ? {
                  borderColor: theme.border,
                  background: theme.soft,
                  color: theme.primary,
                } : undefined}
                aria-pressed={isActive}
                aria-label={`Preview ${theme.name}`}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: theme.primary, flexShrink: 0,
                }} />
                {theme.name}
              </button>
            )
          })}
          <span className="register-dashboard__model-chip" style={{ color: 'var(--text-tertiary)', cursor: 'default' }}>
            +35 more
          </span>
        </div>
      </div>

      {/* Faux chat surface — typewriter loop over 3 routing examples. */}
      <div className="register-dashboard__panel">
        <div className="register-dashboard__panel-head">
          <span className="register-dashboard__panel-title">Live conversation</span>
          <span className="mono-label" style={{ fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="register-dashboard__streaming-dot" aria-hidden="true" />
            STREAMING
          </span>
        </div>
        <div className="register-dashboard__chat">
          <div className="register-dashboard__chat-msg">
            <div className="register-dashboard__chat-avatar">
              <ConvoiaMark size={16} state="streaming" />
            </div>
            <div className="register-dashboard__chat-bubble">
              {typed}
              <span className="register-dashboard__caret" aria-hidden="true" />
            </div>
          </div>
        </div>
        <div className="register-dashboard__chat-meta">
          <span className="register-dashboard__chat-meta-label">Routed to</span>
          <span className="register-dashboard__chat-meta-value">{current.modelName}</span>
        </div>
      </div>

      {/* Concrete value props — what a user actually gets at signup */}
      <div className="register-dashboard__features">
        <div className="register-dashboard__feature">
          <span className="register-dashboard__feature-value">100K</span>
          <span className="register-dashboard__feature-label">Free tokens to start — no card needed</span>
        </div>
        <div className="register-dashboard__feature">
          <span className="register-dashboard__feature-value">~60%</span>
          <span className="register-dashboard__feature-label">Average savings vs single-provider direct API</span>
        </div>
        <div className="register-dashboard__feature">
          <span className="register-dashboard__feature-value">Auto</span>
          <span className="register-dashboard__feature-label">Smart routing picks the best model per query</span>
        </div>
        <div className="register-dashboard__feature">
          <span className="register-dashboard__feature-value">$0/mo</span>
          <span className="register-dashboard__feature-label">Pay only for tokens used — no platform fee</span>
        </div>
      </div>
    </div>
  )
}

export default RegisterDashboard
