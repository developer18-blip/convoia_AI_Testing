import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MarketingNav } from '../../components/marketing/MarketingNav'
import { MarketingFooter } from '../../components/marketing/MarketingFooter'
import { IntellectMark } from '../../components/brand/IntellectMark'
import { Button } from '../../components/primitives/Button'
import { Pill } from '../../components/primitives/Pill'
import { SignalLine } from '../../components/primitives/SignalLine'
import { PROVIDER_THEMES, getProviderFromModelId } from '../../config/providers'
import { useAccent } from '../../contexts/AccentContext'

const DEMO_MODELS = [
  'claude-opus-4-6',
  'gpt-5.4',
  'gemini-3.1-pro',
  'deepseek-chat',
]

export function LandingPage() {
  const [demoModelIndex, setDemoModelIndex] = useState(0)
  const { setActiveModel } = useAccent()

  useEffect(() => {
    // Skip auto-cycling when the user prefers reduced motion — no constant
    // color flashing. The initial model still locks the page accent.
    const prefersReduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setActiveModel(DEMO_MODELS[0])
    if (prefersReduced) return

    const interval = setInterval(() => {
      setDemoModelIndex(i => {
        const next = (i + 1) % DEMO_MODELS.length
        setActiveModel(DEMO_MODELS[next])
        return next
      })
    }, 3500)
    return () => clearInterval(interval)
  }, [setActiveModel])

  const activeDemo = DEMO_MODELS[demoModelIndex]
  const activeProvider = PROVIDER_THEMES[getProviderFromModelId(activeDemo)]

  return (
    <div className="landing-page" data-theme="dark">
      <MarketingNav />

      {/* HERO */}
      <section className="hero">
        <div className="hero__ambient hero__ambient--left" />
        <div className="hero__ambient hero__ambient--right" />
        <div className="hero__inner">
          <div className="hero__eyebrow">
            <div className="hero__eyebrow-dot" />
            <span className="mono-label">ONE INTERFACE · 40+ MODELS · ZERO LOCK-IN</span>
          </div>

          <h1 className="hero__title">
            The AI gateway that<br />
            <span className="hero__title-accent">adopts every model's intelligence.</span>
          </h1>

          <p className="hero__subtitle">
            Route between Claude, GPT, Gemini, and 40 more models from a single workspace.
            Council mode cross-examines responses. Think mode runs deep reasoning. All billed together.
          </p>

          <div className="hero__actions">
            <Link to="/register">
              <Button variant="primary" size="lg" rightIcon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              }>
                Start free
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="ghost" size="lg">Sign in</Button>
            </Link>
          </div>

          <div className="hero__trust mono-label">
            <span>NO CREDIT CARD</span>
            <span className="hero__trust-sep">·</span>
            <span>FREE TIER INCLUDES 100K TOKENS</span>
            <span className="hero__trust-sep">·</span>
            <span>CANCEL ANYTIME</span>
          </div>
        </div>

        {/* Hero product visual */}
        <div className="hero__product">
          <div className="hero__product-frame">
            <div className="hero__product-chrome">
              <div className="hero__product-dots">
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F56' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27C93F' }} />
              </div>
              <div className="mono-label" style={{ fontSize: 10 }}>intellect.convoia.ai/chat</div>
            </div>
            <div className="hero__product-body grain-surface">
              <div className="hero__product-sidebar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 12px' }}>
                  <IntellectMark size={22} state="idle" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Intellect</div>
                    <div className="mono-label" style={{ fontSize: 9, color: 'var(--accent)' }}>{activeDemo}</div>
                  </div>
                </div>
                <div className="mono-label" style={{ padding: '8px 8px 4px', fontSize: 9 }}>ACTIVE MODEL</div>
                {DEMO_MODELS.map(m => {
                  const theme = PROVIDER_THEMES[getProviderFromModelId(m)]
                  const isActive = m === activeDemo
                  return (
                    <div key={m} style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: isActive ? theme.soft : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      position: 'relative',
                      transition: 'all 0.4s ease',
                    }}>
                      {isActive && <div style={{
                        position: 'absolute', left: 0, top: 6, bottom: 6, width: 2,
                        background: theme.primary, borderRadius: '0 2px 2px 0',
                      }} />}
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: theme.primary }} />
                      <div className="mono" style={{
                        fontSize: 10,
                        color: isActive ? theme.primary : 'var(--text-muted)',
                        fontWeight: isActive ? 500 : 400,
                      }}>{m}</div>
                    </div>
                  )
                })}
              </div>

              <div className="hero__product-chat">
                <div className="hero__product-pills">
                  <Pill variant="accent" mono>⚡ Council</Pill>
                  <Pill mono>◈ Think</Pill>
                  <Pill mono>◎ Agent</Pill>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <IntellectMark size={22} state="streaming" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                      Analyzing your question across 3 models. Council verdict in 2.4s.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10, maxWidth: 280 }}>
                      <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--surface-2)', border: '0.5px solid var(--border-subtle)' }}>
                        <div className="mono-label" style={{ fontSize: 9 }}>CONFIDENCE</div>
                        <div className="mono-value" style={{ fontSize: 14, color: 'var(--accent)' }}>92%</div>
                      </div>
                      <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--surface-2)', border: '0.5px solid var(--border-subtle)' }}>
                        <div className="mono-label" style={{ fontSize: 9 }}>MODELS</div>
                        <div className="mono-value" style={{ fontSize: 14, color: 'var(--text-primary)' }}>3/3</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                  <SignalLine />
                  <div style={{
                    marginTop: 6,
                    padding: '8px 12px',
                    border: '0.5px solid var(--border-default)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'var(--surface-2)',
                  }}>
                    <div className="text-body-sm" style={{ flex: 1, color: 'var(--text-muted)' }}>Ask Intellect anything</div>
                    <span className="mono-label" style={{ padding: '2px 5px', border: '0.5px solid currentColor', borderRadius: 3 }}>⌘K</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="hero__product-caption mono-label">
            <div className="hero__product-caption-dot" />
            <span>LIVE · ROUTING THROUGH {activeProvider.name.toUpperCase()}</span>
          </div>
        </div>
      </section>

      {/* PROVIDERS WALL */}
      <section className="providers">
        <div className="providers__inner">
          <div className="mono-label" style={{ textAlign: 'center', marginBottom: 24 }}>
            ROUTING ACROSS PROVIDERS YOU ALREADY TRUST
          </div>
          <div className="providers__grid">
            {Object.entries(PROVIDER_THEMES)
              .filter(([k]) => k !== 'default')
              .map(([key, theme]) => (
                <div key={key} className="providers__item">
                  <div className="providers__dot" style={{ background: theme.primary }} />
                  <div className="providers__name mono">{theme.name}</div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features">
        <div className="features__inner">
          <div className="features__header">
            <div className="section-heading">Platform capabilities</div>
            <h2 className="text-h1" style={{ color: 'var(--text-primary)' }}>Intelligence orchestration,<br />not another chat app.</h2>
          </div>

          <div className="features__grid">
            <div className="feature-card feature-card--wide">
              <div className="feature-card__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="5" cy="5" r="2" />
                  <circle cx="19" cy="5" r="2" />
                  <circle cx="19" cy="19" r="2" />
                  <circle cx="5" cy="19" r="2" />
                  <path d="M7 7l3 3M17 7l-3 3M17 17l-3-3M7 17l3-3" />
                </svg>
              </div>
              <div className="mono-label" style={{ marginBottom: 6 }}>COUNCIL MODE</div>
              <h3 className="text-h3" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>Three models debate. You get the verdict.</h3>
              <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
                Query 3 frontier models simultaneously. A moderator cross-examines their answers for contradictions, reasoning errors, and blind spots. Ship only with consensus.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <div className="mono-label" style={{ marginBottom: 6 }}>THINK MODE</div>
              <h3 className="text-h3" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>Deep reasoning on hard problems.</h3>
              <p className="text-body-sm" style={{ color: 'var(--text-secondary)' }}>
                For questions that need more than a fast answer. Reasoning budget scales with complexity.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9" />
                  <path d="M21 3l-9 9" />
                  <path d="M21 3v6h-6" />
                </svg>
              </div>
              <div className="mono-label" style={{ marginBottom: 6 }}>AGENT MODE</div>
              <h3 className="text-h3" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>Multi-step tasks with tool use.</h3>
              <p className="text-body-sm" style={{ color: 'var(--text-secondary)' }}>
                Autonomous workflows: web search, file analysis, code execution. Runs to completion.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 9h6v6H9z" />
                </svg>
              </div>
              <div className="mono-label" style={{ marginBottom: 6 }}>FILE UPLOADS</div>
              <h3 className="text-h3" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>PDFs, Excel, code, 25+ formats.</h3>
              <p className="text-body-sm" style={{ color: 'var(--text-secondary)' }}>
                Drop any file. Ask questions. Get cited answers with line numbers.
              </p>
            </div>

            <div className="feature-card feature-card--wide">
              <div className="feature-card__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div className="mono-label" style={{ marginBottom: 6 }}>UNIFIED BILLING</div>
              <h3 className="text-h3" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>One invoice for all models. Real-time token tracking.</h3>
              <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
                No juggling API keys, no surprise bills. See every token spent, every cent charged, by user and by model.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="stats">
        <div className="stats__inner">
          <div className="stats__grid">
            <div className="stat">
              <div className="stat__value mono">40+</div>
              <div className="stat__label mono-label">MODELS ROUTED</div>
            </div>
            <div className="stat">
              <div className="stat__value mono">99.95%</div>
              <div className="stat__label mono-label">GATEWAY UPTIME</div>
            </div>
            <div className="stat">
              <div className="stat__value mono">&lt; 200ms</div>
              <div className="stat__label mono-label">ROUTING LATENCY</div>
            </div>
            <div className="stat">
              <div className="stat__value mono">$0.01</div>
              <div className="stat__label mono-label">MIN CHARGE / QUERY</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section className="pricing-teaser">
        <div className="pricing-teaser__inner">
          <div className="section-heading" style={{ textAlign: 'center' }}>Pricing</div>
          <h2 className="text-h1" style={{ textAlign: 'center', marginBottom: 16, color: 'var(--text-primary)' }}>Pay for tokens. Keep your margins.</h2>
          <p className="text-body-lg" style={{ textAlign: 'center', color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto 40px' }}>
            No per-seat tax. No minimum commitments. You pay providers' published rates plus a flat 15% gateway fee.
          </p>

          <div className="pricing-teaser__cta">
            <Link to="/pricing">
              <Button variant="outline" size="lg" rightIcon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              }>
                See pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final-cta">
        <div className="final-cta__inner">
          <div className="final-cta__ambient" />
          <IntellectMark size={56} state="council" />
          <h2 className="text-h1" style={{ marginTop: 24, marginBottom: 12, color: 'var(--text-primary)' }}>
            Stop managing API keys.<br />Start routing intelligence.
          </h2>
          <p className="text-body-lg" style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
            Free tier includes 100K tokens. Takes 60 seconds to sign up.
          </p>
          <Link to="/register">
            <Button variant="primary" size="lg" rightIcon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            }>
              Get started free
            </Button>
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}

export default LandingPage
