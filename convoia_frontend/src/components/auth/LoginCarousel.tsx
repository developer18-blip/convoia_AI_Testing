import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PROVIDER_THEMES } from '../../config/providers'

/**
 * LoginCarousel — interactive right-pane content for the LoginPage in
 * split-pane mode. Cycles through provider-credit slides with manual
 * controls (click slide to advance, click dot to jump, keyboard arrows
 * when focused). A bottom CTA links to /register for users who landed
 * on /login by mistake.
 */

interface Slide {
  providerKey: keyof typeof PROVIDER_THEMES
  body: string
}

const SLIDES: Slide[] = [
  { providerKey: 'anthropic', body: 'Claude Opus 4.7 — frontier reasoning routed in one click.' },
  { providerKey: 'openai',    body: 'GPT-5 + GPT-4.1 family — full OpenAI lineup, no separate billing.' },
  { providerKey: 'google',    body: 'Gemini 2.5 Pro and Flash — multimodal calls, single endpoint.' },
  { providerKey: 'xai',       body: 'Grok 4.20 reasoning — alternative voices when you need them.' },
  { providerKey: 'mistral',   body: 'Mistral Large + Codestral — strong open-weight options when latency matters.' },
  { providerKey: 'deepseek',  body: 'DeepSeek Reasoner — chain-of-thought on tap at fraction of frontier cost.' },
]

const ROTATE_MS = 4500

export function LoginCarousel() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  // Bumped on user interaction so the auto-rotate effect resets its timer
  // (otherwise clicking right when the timer is about to fire still flips
  // to the next-after-clicked slide).
  const [interactionTick, setInteractionTick] = useState(0)
  const stageRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setActive((i) => (i + 1) % SLIDES.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [paused, interactionTick])

  const goTo = (idx: number) => {
    setActive(((idx % SLIDES.length) + SLIDES.length) % SLIDES.length)
    setInteractionTick((t) => t + 1)
  }
  const next = () => goTo(active + 1)
  const prev = () => goTo(active - 1)

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
  }

  // Tint the carousel chrome to match the active slide's provider — eyebrow,
  // active dot, slide border. Set as inline CSS custom properties so the CSS
  // can reference them without React owning the styling. Falls back to the
  // brand turquoise via var() defaults when no slide is active (initial paint).
  const activeTheme = PROVIDER_THEMES[SLIDES[active].providerKey]
  const tintStyle = {
    '--slide-accent': activeTheme.primary,
    '--slide-accent-soft': activeTheme.soft,
    '--slide-accent-border': activeTheme.border,
  } as React.CSSProperties

  return (
    <div
      className="login-carousel"
      style={tintStyle}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="login-carousel__header">
        <span className="login-carousel__eyebrow mono-label">Multi-model gateway</span>
        <h2 className="login-carousel__title">One API. Every model that matters.</h2>
        <p className="login-carousel__subtitle">
          Route each query to the model that actually fits — by capability, latency, or cost — without juggling provider keys.
        </p>
      </div>

      <div
        className="login-carousel__stage login-carousel__stage--interactive"
        ref={stageRef}
        role="button"
        tabIndex={0}
        aria-label={`Provider ${active + 1} of ${SLIDES.length}: ${PROVIDER_THEMES[SLIDES[active].providerKey].name}`}
        aria-live="polite"
        onClick={next}
        onKeyDown={handleKey}
      >
        {SLIDES.map((slide, idx) => {
          const theme = PROVIDER_THEMES[slide.providerKey]
          return (
            <div
              key={slide.providerKey}
              className={'login-carousel__slide' + (idx === active ? ' login-carousel__slide--active' : '')}
              aria-hidden={idx !== active}
            >
              <div className="login-carousel__slide-head">
                <span className="login-carousel__provider-dot" style={{ background: theme.primary }} />
                <span className="login-carousel__provider-name">{theme.name.toUpperCase()}</span>
              </div>
              <div className="login-carousel__slide-body">{slide.body}</div>
            </div>
          )
        })}
      </div>

      <div className="login-carousel__indicator" role="tablist" aria-label="Provider slides">
        {SLIDES.map((s, idx) => (
          <button
            key={s.providerKey}
            type="button"
            role="tab"
            aria-selected={idx === active}
            aria-label={`Show ${PROVIDER_THEMES[s.providerKey].name}`}
            className={'login-carousel__dot' + (idx === active ? ' login-carousel__dot--active' : '')}
            onClick={(e) => { e.stopPropagation(); goTo(idx) }}
          />
        ))}
      </div>

      <div className="login-carousel__stats">
        <div className="login-carousel__stat">
          <span className="login-carousel__stat-label">Active models</span>
          <span className="login-carousel__stat-value">41</span>
        </div>
        <div className="login-carousel__stat">
          <span className="login-carousel__stat-label">Providers</span>
          <span className="login-carousel__stat-value">7</span>
        </div>
      </div>

      {/* CTA for users who landed on /login but don't have an account yet.
          Returning users ignore it; misclickers get a nudge to /register. */}
      <Link to="/register" className="login-carousel__cta">
        <span className="login-carousel__cta-label">New to Convoia?</span>
        <span className="login-carousel__cta-headline">
          Get <span className="login-carousel__cta-highlight">100K free tokens</span> to start
        </span>
        <span className="login-carousel__cta-arrow" aria-hidden="true">→</span>
      </Link>
    </div>
  )
}

export default LoginCarousel
