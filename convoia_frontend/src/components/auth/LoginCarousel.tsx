import { useEffect, useState } from 'react'
import { PROVIDER_THEMES } from '../../config/providers'

/**
 * LoginCarousel — quiet right-pane content for the LoginPage in split-pane
 * mode. Returning users don't need a sales pitch, so this is a low-key
 * platform-status panel: a rotating provider-credit slide + two static
 * stats. Aria-hidden via the parent wrapper.
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
]

const ROTATE_MS = 4500

export function LoginCarousel() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setActive((i) => (i + 1) % SLIDES.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [paused])

  return (
    <div
      className="login-carousel"
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

      <div className="login-carousel__stage">
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

      <div className="login-carousel__indicator" aria-hidden="true">
        {SLIDES.map((s, idx) => (
          <span
            key={s.providerKey}
            className={'login-carousel__dot' + (idx === active ? ' login-carousel__dot--active' : '')}
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
    </div>
  )
}

export default LoginCarousel
