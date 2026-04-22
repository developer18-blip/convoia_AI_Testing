import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { MarketingNav } from '../../components/marketing/MarketingNav'
import { MarketingFooter } from '../../components/marketing/MarketingFooter'
import { IntellectMark } from '../../components/brand/IntellectMark'
import { Button } from '../../components/primitives/Button'
import { PROVIDER_THEMES } from '../../config/providers'
import type { ProviderKey } from '../../config/providers'
import { useAccent } from '../../contexts/AccentContext'

const DEMO_MODELS = [
  'claude-opus-4-6',
  'gpt-5.4',
  'gemini-3.1-pro',
  'deepseek-chat',
]

const PROVIDERS_LIST: Array<{ key: ProviderKey; models: string }> = [
  { key: 'openai', models: 'GPT-5.4, GPT-4.1, o3, o4-mini' },
  { key: 'anthropic', models: 'Claude Opus 4.6, Sonnet 4.6, Haiku 4.5' },
  { key: 'google', models: 'Gemini 3.1 Pro, 2.5 Pro, 2.5 Flash' },
  { key: 'perplexity', models: 'Sonar Pro, Sonar Reasoning Pro' },
  { key: 'xai', models: 'Grok 4.20, Grok 3, Grok 3 Mini' },
  { key: 'deepseek', models: 'DeepSeek Chat, Reasoner' },
  { key: 'mistral', models: 'Mistral Large, Mistral Small' },
  { key: 'meta', models: 'Llama 3.3 70B, Mixtral 8x7B' },
]

type CtaVariant = 'primary' | 'secondary' | 'outline'

const PRICING_TIERS: Array<{
  name: string
  icon: string
  price: string
  tokens: string
  perMillion: string
  badge: string | null
  badgeColor?: 'success' | 'accent'
  save?: string
  approx: string[]
  features: string[]
  cta: string
  ctaVariant: CtaVariant
  featured?: boolean
}> = [
  {
    name: 'Starter', icon: '⚡', price: '$5', tokens: '500K', perMillion: '$10.00',
    badge: null,
    approx: ['~500 messages with GPT-4o-mini', '~80 messages with GPT-4o'],
    features: ['500,000 tokens', 'All 35+ AI models', 'Image & video generation', 'No expiry — use anytime'],
    cta: 'Get started', ctaVariant: 'secondary',
  },
  {
    name: 'Standard', icon: '🚀', price: '$14', tokens: '2M', perMillion: '$7.00',
    badge: 'Recommended', badgeColor: 'success', save: 'Save 30%',
    approx: ['~2,000 messages with GPT-4o-mini', '~320 messages with GPT-4o'],
    features: ['2,000,000 tokens', 'All 35+ AI models', 'Deep Think Mode', 'Image & video generation', 'Usage analytics'],
    cta: 'Buy 2M Tokens', ctaVariant: 'outline',
  },
  {
    name: 'Popular', icon: '⭐', price: '$25', tokens: '5M', perMillion: '$5.00',
    badge: 'Most Popular', badgeColor: 'accent', save: 'Save 50%',
    approx: ['~5,000 messages with GPT-4o-mini', '~800 messages with GPT-4o'],
    features: ['5,000,000 tokens', 'All 35+ AI models', 'Deep Think Mode', 'AI Agents', 'Team token allocation', 'Usage analytics'],
    cta: 'Buy 5M Tokens', ctaVariant: 'primary', featured: true,
  },
  {
    name: 'Power', icon: '💎', price: '$60', tokens: '15M', perMillion: '$4.00',
    badge: null, save: 'Save 60%',
    approx: ['~15,000 messages with GPT-4o-mini', '~2,400 messages with GPT-4o'],
    features: ['15,000,000 tokens', 'All 35+ AI models', 'Deep Think Mode', 'AI Agents', 'Full org hierarchy', 'Team management', 'Budget controls'],
    cta: 'Buy 15M Tokens', ctaVariant: 'secondary',
  },
]

const TESTIMONIALS = [
  {
    title: 'Great AI Platform for Team Work',
    body: "I really love the multi-LLM feature and the management system is the benchmark which is very unique. You have the tracking for your tokens, and if you are the owner of the organisation, this one application manages all the premium LLMs for you at an effective price.",
    name: 'Anirudh Rai',
    role: 'Applied AI Engineer at Convoia AI',
    initials: 'AR',
    rating: 5,
  },
]

const HOW_IT_WORKS = [
  { num: '01', title: 'Create your account', desc: 'Sign up in 30 seconds. Buy tokens and start chatting instantly.' },
  { num: '02', title: 'Choose your model', desc: 'Pick from 35+ AI models across 8 providers. Switch models mid-conversation.' },
  { num: '03', title: 'Chat, create, analyze', desc: 'Chat with AI, generate images & videos, use Deep Think Mode, deploy AI agents.' },
]

const FEATURE_CARDS = [
  { icon: '🌐', title: 'Universal Gateway', desc: 'Access GPT-5.4, Claude Opus 4.6, Gemini 3.1, DeepSeek, and more through a single platform.' },
  { icon: '$', title: 'Smart Cost Engine', desc: 'Cost-aware token deduction — cheap models cost less, expensive models cost more. Always transparent.' },
  { icon: '🏢', title: 'Enterprise Hierarchy', desc: 'Organizations, teams, managers, budgets, token allocation. Built for how real companies work.' },
  { icon: '🧠', title: 'Deep Think Mode', desc: 'Multi-pass reasoning with research, analysis, and refinement. Like having a senior consultant.' },
  { icon: '🛡', title: 'Auto Fallback', desc: 'Set budget caps with automatic model downgrade. Provider goes down? Auto-switches. Zero downtime.' },
  { icon: '✨', title: 'AI Agents', desc: 'Pre-built expert agents for coding, writing, analysis, marketing, and more. One-click expertise.' },
]

export function LandingPage() {
  const [demoModelIndex, setDemoModelIndex] = useState(0)
  const { setActiveModel } = useAccent()

  useEffect(() => {
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
    // setActiveModel is stable from context; don't refire on identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the eslint disable narrow — demoModelIndex is only updated by the
  // interval itself so we don't need it in the dep array.
  void demoModelIndex

  return (
    <div className="landing-page">
      <MarketingNav />

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero__ambient lp-hero__ambient--left" />
        <div className="lp-hero__ambient lp-hero__ambient--right" />
        <div className="lp-hero__inner">
          <div className="lp-hero__eyebrow">
            <div className="lp-hero__eyebrow-dot" />
            <span className="mono-label">NOW WITH 35+ AI MODELS</span>
          </div>

          <h1 className="lp-hero__title">
            One platform.<br />
            <span className="lp-hero__title-accent">Every AI model.</span><br />
            Full control.
          </h1>

          <p className="lp-hero__subtitle">
            Access GPT-5.4, Claude Opus 4.6, Gemini 3.1, DeepSeek, and 30+ more through a single dashboard.
            Track costs per query, manage team budgets, and never overspend on AI.
          </p>

          <div className="lp-hero__actions">
            <Link to="/register">
              <Button variant="primary" size="lg" rightIcon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              }>
                Start for free
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="secondary" size="lg" rightIcon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              }>
                See how it works
              </Button>
            </a>
          </div>

          {/* Provider cards grid */}
          <div className="lp-hero__providers">
            {PROVIDERS_LIST.map(p => {
              const theme = PROVIDER_THEMES[p.key]
              return (
                <div key={p.key} className="lp-provider-card" style={{
                  '--provider-color': theme.primary,
                  '--provider-soft': theme.soft,
                } as CSSProperties}>
                  <div className="lp-provider-card__head">
                    <div className="lp-provider-card__dot" />
                    <div className="lp-provider-card__name">{theme.name}</div>
                  </div>
                  <div className="lp-provider-card__models mono">{p.models}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="lp-stats">
        <div className="lp-stats__inner">
          <div className="lp-stat">
            <div className="lp-stat__value mono">35+</div>
            <div className="lp-stat__label">AI Models</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat__value mono">8</div>
            <div className="lp-stat__label">Providers</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat__value mono">4</div>
            <div className="lp-stat__label">Think Tiers</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat__value mono">99.9%</div>
            <div className="lp-stat__label">Uptime</div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="lp-features">
        <div className="lp-features__inner">
          <div className="lp-features__header">
            <div className="section-heading">Everything you need</div>
            <h2 className="text-h1" style={{ color: 'var(--text-primary)' }}>Everything you need to manage AI</h2>
            <p className="text-body-lg" style={{ color: 'var(--text-secondary)', marginTop: 12 }}>
              Built for teams that take AI seriously. Every feature designed for production use.
            </p>
          </div>

          <div className="lp-features__grid">
            {FEATURE_CARDS.map((f, i) => (
              <div key={i} className="lp-feature-card">
                <div className="lp-feature-card__icon">{f.icon}</div>
                <h3 className="lp-feature-card__title">{f.title}</h3>
                <p className="lp-feature-card__desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="lp-how">
        <div className="lp-how__inner">
          <div className="section-heading" style={{ textAlign: 'center' }}>Getting started</div>
          <h2 className="text-h1" style={{ textAlign: 'center', marginBottom: 56, color: 'var(--text-primary)' }}>How it works</h2>
          <div className="lp-how__steps">
            {HOW_IT_WORKS.map(step => (
              <div key={step.num} className="lp-how-step">
                <div className="lp-how-step__num mono">{step.num}</div>
                <div className="lp-how-step__body">
                  <h3 className="text-h3" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>{step.title}</h3>
                  <p className="text-body" style={{ color: 'var(--text-secondary)', margin: 0 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING PREVIEW */}
      <section id="pricing" className="lp-pricing">
        <div className="lp-pricing__inner">
          <div className="lp-pricing__header">
            <div className="section-heading" style={{ textAlign: 'center' }}>Pricing</div>
            <h2 className="text-h1" style={{ textAlign: 'center', marginBottom: 12, color: 'var(--text-primary)' }}>Pay only for what you use</h2>
            <p className="text-body-lg" style={{ textAlign: 'center', color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto 40px' }}>
              Buy tokens once. Use them anytime. No subscriptions. No monthly fees.
            </p>
          </div>

          <div className="lp-pricing__grid">
            {PRICING_TIERS.map(tier => (
              <div key={tier.name} className={`lp-tier ${tier.featured ? 'lp-tier--featured' : ''}`}>
                {tier.badge && (
                  <div className={`lp-tier__badge lp-tier__badge--${tier.badgeColor}`}>
                    {tier.badge}
                  </div>
                )}
                <div className="lp-tier__head">
                  <span className="lp-tier__icon">{tier.icon}</span>
                  <span className="lp-tier__name mono-label">{tier.name.toUpperCase()}</span>
                </div>
                <div className="lp-tier__tokens">
                  <span className="lp-tier__tokens-value mono">{tier.tokens}</span>
                  <span className="lp-tier__tokens-label">tokens</span>
                </div>
                <div className="lp-tier__price">
                  <span className="lp-tier__price-value mono">{tier.price}</span>
                  <span className="lp-tier__price-label">one-time</span>
                </div>
                <div className="lp-tier__per-m">
                  <span className="mono">{tier.perMillion}</span> per 1M tokens
                </div>
                {tier.save && <div className="lp-tier__save">{tier.save}</div>}
                <div className="lp-tier__approx">
                  {tier.approx.map((a, i) => <div key={i}>{a}</div>)}
                </div>
                <ul className="lp-tier__features">
                  {tier.features.map(f => (
                    <li key={f}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="lp-tier__cta">
                  <Link to="/register">
                    <Button variant={tier.ctaVariant} size="md" style={{ width: '100%' }}>
                      {tier.cta}
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <Link to="/pricing">
              <Button variant="ghost" size="md" rightIcon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              }>
                See full pricing details
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section id="reviews" className="lp-reviews">
        <div className="lp-reviews__inner">
          <div className="lp-reviews__header">
            <div className="section-heading" style={{ textAlign: 'center' }}>
              ⭐ 5.0 AVERAGE FROM REVIEWS
            </div>
            <h2 className="text-h1" style={{ textAlign: 'center', marginBottom: 12, color: 'var(--text-primary)' }}>What our users say</h2>
            <p className="text-body-lg" style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 32 }}>
              Real feedback from teams and individuals using Intellect AI every day.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 56 }}>
              <Button variant="outline" size="md" leftIcon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              }>
                Write a Review
              </Button>
            </div>
          </div>

          <div className="lp-reviews__grid">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="lp-review-card">
                <div className="lp-review-card__quote-mark">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 7h3l-2 5h3v6H6V10l1-3zm8 0h3l-2 5h3v6h-5V10l1-3z" />
                  </svg>
                </div>
                <h3 className="lp-review-card__title">{t.title}</h3>
                <p className="lp-review-card__body">{t.body}</p>
                <div className="lp-review-card__footer">
                  <div className="lp-review-card__author">
                    <div className="lp-review-card__avatar">{t.initials}</div>
                    <div>
                      <div className="lp-review-card__name">{t.name}</div>
                      <div className="lp-review-card__role mono-label">{t.role.toUpperCase()}</div>
                    </div>
                  </div>
                  <div className="lp-review-card__stars">
                    {[...Array(t.rating)].map((_, i) => (
                      <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-final-cta">
        <div className="lp-final-cta__inner">
          <div className="lp-final-cta__ambient" />
          <IntellectMark size={48} state="council" />
          <h2 className="text-h1" style={{ marginTop: 24, marginBottom: 12, color: 'var(--text-primary)' }}>
            Ready to take control of your AI spend?
          </h2>
          <p className="text-body-lg" style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
            Join teams who manage their AI costs without sacrificing capability.
          </p>
          <Link to="/register">
            <Button variant="primary" size="lg" rightIcon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            }>
              Start for free
            </Button>
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}

export default LandingPage
