import { ConvoiaMark } from '../brand/ConvoiaMark'
import { PROVIDER_THEMES } from '../../config/providers'

/**
 * RegisterDashboard — right-pane content for RegisterPage in split-pane
 * mode. Static faux-dashboard preview that signals what users will get
 * post-signup: model picker variety, a sample chat surface, and the
 * concrete value props (free tokens, no card, smart routing). Decorative
 * only — aria-hidden via the parent wrapper.
 */

const PREVIEW_PROVIDERS: (keyof typeof PROVIDER_THEMES)[] = [
  'anthropic', 'openai', 'google', 'xai', 'mistral', 'deepseek',
]

export function RegisterDashboard() {
  return (
    <div className="register-dashboard">
      <div className="register-dashboard__header">
        <span className="register-dashboard__eyebrow">Your workspace, day one</span>
        <h2 className="register-dashboard__title">Every frontier model, one billing line.</h2>
        <p className="register-dashboard__subtitle">
          Sign up in under a minute and route your first query across 40+ models — no separate provider accounts, no per-model contracts.
        </p>
      </div>

      {/* Faux model-picker panel — communicates "you get all of these" */}
      <div className="register-dashboard__panel">
        <div className="register-dashboard__panel-head">
          <span className="register-dashboard__panel-title">Model router</span>
          <span className="mono-label" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            AUTO
          </span>
        </div>
        <div className="register-dashboard__model-row">
          {PREVIEW_PROVIDERS.map((key) => {
            const theme = PROVIDER_THEMES[key]
            return (
              <span key={key} className="register-dashboard__model-chip">
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: theme.primary, flexShrink: 0,
                }} />
                {theme.name}
              </span>
            )
          })}
          <span className="register-dashboard__model-chip" style={{ color: 'var(--text-tertiary)' }}>
            +35 more
          </span>
        </div>
      </div>

      {/* Faux chat surface — signals what the actual product looks like */}
      <div className="register-dashboard__panel">
        <div className="register-dashboard__panel-head">
          <span className="register-dashboard__panel-title">Live conversation</span>
          <span className="mono-label" style={{ fontSize: 10, color: 'var(--accent)' }}>
            STREAMING
          </span>
        </div>
        <div className="register-dashboard__chat">
          <div className="register-dashboard__chat-msg">
            <div className="register-dashboard__chat-avatar">
              <ConvoiaMark size={16} state="idle" />
            </div>
            <div className="register-dashboard__chat-bubble">
              ConvoiaAI picked <strong style={{ color: 'var(--text-primary)' }}>Claude Sonnet 4.6</strong> for this question — best balance of accuracy and cost on long-form analysis.
            </div>
          </div>
          <div className="register-dashboard__chat-msg">
            <div className="register-dashboard__chat-avatar">
              <ConvoiaMark size={16} state="streaming" />
            </div>
            <div className="register-dashboard__chat-bubble">
              Switching to <strong style={{ color: 'var(--text-primary)' }}>GPT-5.4 Nano</strong> for the follow-up — same context, 8× cheaper.
            </div>
          </div>
        </div>
      </div>

      {/* Concrete value props — what a user actually gets at signup */}
      <div className="register-dashboard__features">
        <div className="register-dashboard__feature">
          <span className="register-dashboard__feature-value">10K</span>
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
