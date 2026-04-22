import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { MarketingNav } from '../../components/marketing/MarketingNav'
import { MarketingFooter } from '../../components/marketing/MarketingFooter'
import { IntellectMark } from '../../components/brand/IntellectMark'
import { Button } from '../../components/primitives/Button'
import { Pill } from '../../components/primitives/Pill'
import { PROVIDER_THEMES } from '../../config/providers'
import type { ProviderKey } from '../../config/providers'
import { useAccent } from '../../contexts/AccentContext'

type TierVariant = 'primary' | 'secondary' | 'outline'

const PROVIDERS: Array<{ key: ProviderKey; models: string }> = [
  { key: 'openai', models: 'GPT-5.4, GPT-4.1, o3, o4-mini' },
  { key: 'anthropic', models: 'Claude Opus 4.6, Sonnet 4.6, Haiku 4.5' },
  { key: 'google', models: 'Gemini 3.1 Pro, 2.5 Pro, 2.5 Flash' },
  { key: 'perplexity', models: 'Sonar Pro, Sonar Reasoning Pro' },
  { key: 'xai', models: 'Grok 4.20, Grok 3, Grok 3 Mini' },
  { key: 'deepseek', models: 'DeepSeek Chat, Reasoner' },
  { key: 'mistral', models: 'Mistral Large, Mistral Small' },
  { key: 'meta', models: 'Llama 3.3 70B, Mixtral 8x7B' },
]

interface Tier {
  name: string
  icon: string
  price: string
  tokens: string
  perM: string
  sub: string
  badge?: string
  save?: string
  features: string[]
  cta: string
  variant: TierVariant
  featured?: boolean
}

const PRICING: Tier[] = [
  {
    name: 'Starter', icon: '⚡', price: '$5', tokens: '500K', perM: '$10.00',
    sub: 'For individuals testing the waters',
    features: ['500,000 tokens', 'All 35+ AI models', 'Image & video generation', 'No expiry'],
    cta: 'Get started', variant: 'secondary',
  },
  {
    name: 'Standard', icon: '🚀', price: '$14', tokens: '2M', perM: '$7.00',
    sub: 'For solo power users',
    badge: 'Recommended', save: 'Save 30%',
    features: ['2M tokens', 'All 35+ AI models', 'Deep Think Mode', 'Image & video generation', 'Usage analytics'],
    cta: 'Buy 2M Tokens', variant: 'outline',
  },
  {
    name: 'Team', icon: '⭐', price: '$25', tokens: '5M', perM: '$5.00',
    sub: 'For 5–20 person teams',
    badge: 'Most Popular', save: 'Save 50%',
    features: ['5M tokens', 'All 35+ AI models', 'Deep Think Mode', 'AI Agents', 'Team token allocation', 'Usage analytics per member'],
    cta: 'Buy 5M Tokens', variant: 'primary', featured: true,
  },
  {
    name: 'Scale', icon: '💎', price: '$60', tokens: '15M', perM: '$4.00',
    sub: 'For growing teams (20–50)',
    save: 'Save 60%',
    features: ['15M tokens', 'All 35+ AI models', 'Deep Think Mode', 'AI Agents', 'Role-based access', 'Team management', 'Budget controls'],
    cta: 'Buy 15M Tokens', variant: 'secondary',
  },
]

const PROBLEMS = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    pain: 'Five different AI subscriptions',
    cost: 'Claude Pro, ChatGPT Plus, Gemini Advanced, Perplexity Pro, Cursor = $120+/month per person',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    pain: 'API keys scattered everywhere',
    cost: 'Engineers copy-pasting keys into Slack, no audit trail, rotation is a fire drill',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    pain: "Bills you can't predict",
    cost: 'One engineer burns $2K on GPT-5.4 experiments. You find out 30 days later on the invoice.',
  },
]

const FEATURES = [
  {
    title: 'One login. 35+ models.',
    body: 'Switch between Claude, GPT, Gemini, and 30+ more mid-conversation. No re-authenticating. No multiple tabs. Same token balance funds them all.',
    accent: true,
  },
  {
    title: 'Per-query cost display',
    body: 'See exactly what each message costs before you send it. Set budget caps per user. Auto-downgrade to cheaper models when you hit limits.',
  },
  {
    title: 'Council mode',
    body: 'Query 3 frontier models simultaneously. A moderator cross-examines their answers for contradictions. Ship only with consensus.',
  },
  {
    title: 'Deep Think Mode',
    body: 'Multi-pass reasoning for problems that need more than a fast answer. The AI researches, drafts, critiques itself, refines. Like hiring a senior consultant.',
  },
  {
    title: 'Team budget controls',
    body: "Set monthly token budgets per user or team. Approve overages. See who's spending how much, on which models, for what.",
  },
  {
    title: 'Drop any file',
    body: 'PDFs, Excel, CSVs, code, images, audio. 25+ formats. Ask questions. Get cited answers with line numbers you can jump to.',
  },
]

const HOW_STEPS = [
  { num: '01', title: 'Sign up in 30 seconds', body: 'Email + password. No credit card. 500K free tokens to test every model.' },
  { num: '02', title: 'Pick a model, or let us pick', body: 'Choose from Claude, GPT, Gemini, and 32 more. Or let Auto-Route pick the best model for the task.' },
  { num: '03', title: 'See your savings in real time', body: 'Every query shows the cost. Compare against running the same workload on direct APIs. Most teams save 40–60%.' },
]

const FAQ = [
  {
    q: 'How do you actually save money vs. using APIs directly?',
    a: 'Three ways: (1) We route each query to the cheapest capable model — your code questions go to fast/cheap models, your reasoning questions to expensive ones, automatically. (2) We cache repeated queries. (3) Team-level token pooling means unused budget from one user helps another. Most teams cut their AI spend by 40–60% in the first month.',
  },
  {
    q: 'Do you log or train on our prompts?',
    a: 'No. Your prompts go directly to the AI provider you chose (Anthropic, OpenAI, Google, etc.) under their data policies. We only log metadata (model name, token count, timestamp) for your billing. No prompt contents are retained on our servers.',
  },
  {
    q: 'What happens when a provider has an outage?',
    a: 'Auto Fallback automatically routes to an equivalent model from another provider. If Claude is down, your requests switch to GPT-5.4 or Gemini 3.1 Pro. Zero downtime.',
  },
  {
    q: 'Can I use this for my 5–20 person team?',
    a: 'Yes — this is exactly who we built for. Our Team plan ($25 for 5M tokens) gives you per-member token allocation, usage analytics, and role-based access. Larger teams use our Scale plan.',
  },
  {
    q: 'Do my tokens expire?',
    a: 'No. Tokens never expire. Buy once, use them whenever you need. No monthly subscription trap.',
  },
  {
    q: 'Are you SOC 2 certified?',
    a: "Not yet. We're starting the process now and expect SOC 2 Type I by Q4 2026, Type II by Q2 2027. If your company requires SOC 2, join our waitlist and we'll notify you when we're audit-ready. See our Enterprise section below.",
  },
]

export function LandingPage() {
  // Reset the dynamic accent to default (turquoise) on mount. Marketing pages
  // stay on-brand regardless of whatever provider accent the user had active
  // elsewhere in the app. setActiveModel('') resolves via getProviderFromModelId
  // to the 'default' theme, which is Intellect turquoise.
  const { setActiveModel } = useAccent()
  useEffect(() => { setActiveModel('') }, [setActiveModel])

  return (
    <div className="landing-page">
      <MarketingNav />

      {/* 1. HERO */}
      <section className="lp-hero">
        <div className="lp-hero__ambient" />
        <div className="lp-hero__inner">
          <div className="lp-hero__eyebrow">
            <span className="lp-hero__eyebrow-dot" />
            <span className="mono-label">ONE PLATFORM · 35+ AI MODELS · TEAM BILLING</span>
          </div>

          <h1 className="lp-hero__title">
            Your team's AI bill,<br />
            <span className="lp-hero__title-accent">cut in half.</span>
          </h1>

          <p className="lp-hero__sub">
            Stop paying five different AI subscriptions. Route every query across 35+ models from one platform,
            one invoice, one team budget. Most teams save 40–60% in the first month.
          </p>

          <div className="lp-hero__actions">
            <Link to="/register">
              <Button variant="primary" size="lg" rightIcon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              }>
                Start free — 500K tokens
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="ghost" size="lg">See how it works</Button>
            </a>
          </div>

          <div className="lp-hero__trust">
            {['No credit card', 'Cancel anytime', 'Setup in 60 seconds'].map(t => (
              <div key={t} className="lp-hero__trust-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{t}</span>
              </div>
            ))}
          </div>

          <div className="lp-providers-grid">
            {PROVIDERS.map(p => {
              const theme = PROVIDER_THEMES[p.key]
              return (
                <div key={p.key} className="lp-provider-card" style={{
                  '--p-color': theme.primary,
                  '--p-soft': theme.soft,
                } as CSSProperties}>
                  <div className="lp-provider-card__head">
                    <span className="lp-provider-card__dot" />
                    <span className="lp-provider-card__name">{theme.name}</span>
                  </div>
                  <div className="lp-provider-card__models mono">{p.models}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 2. PROBLEM */}
      <section className="lp-problem">
        <div className="lp-problem__inner">
          <div className="section-heading" style={{ textAlign: 'center' }}>THE AI TAX YOU'RE PAYING</div>
          <h2 className="text-h1" style={{ textAlign: 'center', margin: '0 auto 12px', maxWidth: 720, color: 'var(--text-primary)' }}>
            If your team uses AI tools, this looks familiar.
          </h2>
          <p className="text-body-lg" style={{ textAlign: 'center', color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto 48px' }}>
            Every AI-native team hits the same three walls. The cost of <em>not</em> fixing them doubles every quarter.
          </p>
          <div className="lp-problem__grid">
            {PROBLEMS.map((p, i) => (
              <div key={i} className="lp-problem-card">
                <div className="lp-problem-card__icon">{p.icon}</div>
                <h3 className="lp-problem-card__pain">{p.pain}</h3>
                <p className="lp-problem-card__cost">{p.cost}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. SOLUTION */}
      <section className="lp-solution">
        <div className="lp-solution__ambient" />
        <div className="lp-solution__inner">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <IntellectMark size={48} state="council" />
            <div className="section-heading" style={{ marginTop: 16, marginBottom: 8 }}>THE FIX</div>
            <h2 className="text-h1" style={{ marginBottom: 12, color: 'var(--text-primary)' }}>
              One gateway.<br />
              <span style={{ color: 'var(--accent)' }}>One invoice.</span> Real visibility.
            </h2>
            <p className="text-body-lg" style={{ color: 'var(--text-secondary)', maxWidth: 640, margin: '0 auto' }}>
              Intellect sits between your team and every AI provider. Your people use the best model for the job.
              You see every token spent, every cent charged, by user and by model.
            </p>
          </div>

          <div className="lp-dashboard-mock grain-surface">
            <div className="lp-dashboard-mock__chrome">
              <div className="lp-dashboard-mock__dots">
                <span style={{ background: '#FF5F56' }} />
                <span style={{ background: '#FFBD2E' }} />
                <span style={{ background: '#27C93F' }} />
              </div>
              <div className="mono-label" style={{ fontSize: 10 }}>intellect.convoia.ai/analytics</div>
            </div>
            <div className="lp-dashboard-mock__body">
              <div className="lp-dashboard-mock__header">
                <div>
                  <div className="section-heading" style={{ marginBottom: 4 }}>YOUR TEAM · LAST 30 DAYS</div>
                  <h3 className="text-h2" style={{ margin: 0, color: 'var(--text-primary)' }}>
                    $842 <span style={{ color: 'var(--text-tertiary)', fontSize: '60%', fontWeight: 400 }}>vs $2,160 on direct APIs</span>
                  </h3>
                </div>
                <Pill variant="success" mono>— 61% SAVED</Pill>
              </div>
              <div className="lp-dashboard-mock__metrics">
                <div className="lp-metric-tile">
                  <div className="mono-label" style={{ fontSize: 10 }}>TOKENS USED</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 500, marginTop: 2, color: 'var(--text-primary)' }}>4.2M</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>across 12 team members</div>
                </div>
                <div className="lp-metric-tile">
                  <div className="mono-label" style={{ fontSize: 10 }}>TOP MODEL</div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 500, marginTop: 2, color: 'var(--text-primary)' }}>claude-opus-4.6</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>2.1M tokens · 48%</div>
                </div>
                <div className="lp-metric-tile">
                  <div className="mono-label" style={{ fontSize: 10 }}>AUTO-ROUTED</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 500, marginTop: 2, color: 'var(--accent)' }}>74%</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>queries to cheap models</div>
                </div>
                <div className="lp-metric-tile">
                  <div className="mono-label" style={{ fontSize: 10 }}>OVER BUDGET</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 500, marginTop: 2, color: 'var(--color-success)' }}>0</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>auto-capped at limits</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section id="how-it-works" className="lp-how">
        <div className="lp-how__inner">
          <div className="section-heading" style={{ textAlign: 'center' }}>HOW IT WORKS</div>
          <h2 className="text-h1" style={{ textAlign: 'center', marginBottom: 56, color: 'var(--text-primary)' }}>Three steps to save money today.</h2>
          <div className="lp-how__steps">
            {HOW_STEPS.map(s => (
              <div key={s.num} className="lp-how-step">
                <div className="lp-how-step__num mono">{s.num}</div>
                <div className="lp-how-step__body">
                  <h3 className="text-h3" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>{s.title}</h3>
                  <p className="text-body" style={{ color: 'var(--text-secondary)', margin: 0 }}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. PROOF */}
      <section className="lp-proof">
        <div className="lp-proof__inner">
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Pill variant="accent" mono>⚡ EARLY ACCESS</Pill>
            <h2 className="text-h1" style={{ marginTop: 16, marginBottom: 12, color: 'var(--text-primary)' }}>
              Be one of our first 100 teams.
            </h2>
            <p className="text-body-lg" style={{ color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto' }}>
              We're in early access. Direct line to the team building it. Founder pricing locked for your first year.
              No sales calls — sign up, start saving.
            </p>
          </div>

          <div className="lp-proof__grid">
            <div className="lp-proof-card">
              <div className="mono-label" style={{ fontSize: 10, marginBottom: 8 }}>AVG. SAVINGS</div>
              <div className="mono" style={{ fontSize: 40, fontWeight: 500, color: 'var(--accent)' }}>47%</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                on AI spend vs. direct APIs, measured on our first 8 design-partner teams
              </div>
            </div>
            <div className="lp-proof-card">
              <div className="mono-label" style={{ fontSize: 10, marginBottom: 8 }}>SETUP TIME</div>
              <div className="mono" style={{ fontSize: 40, fontWeight: 500, color: 'var(--accent)' }}>&lt; 2 min</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                from signup to first query, no API keys to paste
              </div>
            </div>
            <div className="lp-proof-card">
              <div className="mono-label" style={{ fontSize: 10, marginBottom: 8 }}>MODELS LIVE</div>
              <div className="mono" style={{ fontSize: 40, fontWeight: 500, color: 'var(--accent)' }}>35+</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                across 8 providers. New models added within 48 hours of release.
              </div>
            </div>
          </div>

          <div className="lp-testimonial">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--accent)" opacity="0.3" style={{ marginBottom: 12 }}>
              <path d="M7 7h3l-2 5h3v6H6V10l1-3zm8 0h3l-2 5h3v6h-5V10l1-3z" />
            </svg>
            <p className="lp-testimonial__body">
              "I built this because my team was bleeding money across six AI subscriptions. Now we run everything through one dashboard.
              The cost-per-query breakdown alone saved us from a $2K surprise bill last month."
            </p>
            <div className="lp-testimonial__author">
              <div className="lp-testimonial__avatar">AR</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Anirudh Rai</div>
                <div className="mono-label" style={{ fontSize: 10, marginTop: 2 }}>FOUNDER · INTELLECT AI</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FEATURES */}
      <section id="features" className="lp-features">
        <div className="lp-features__inner">
          <div className="section-heading" style={{ textAlign: 'center' }}>WHAT'S INSIDE</div>
          <h2 className="text-h1" style={{ textAlign: 'center', marginBottom: 56, color: 'var(--text-primary)' }}>Everything your team needs.</h2>
          <div className="lp-features__grid">
            {FEATURES.map((f, i) => (
              <div key={i} className={`lp-feature ${f.accent ? 'lp-feature--accent' : ''}`}>
                <h3 className="lp-feature__title">{f.title}</h3>
                <p className="lp-feature__body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. PRICING */}
      <section id="pricing" className="lp-pricing">
        <div className="lp-pricing__inner">
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div className="section-heading">PRICING</div>
            <h2 className="text-h1" style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Pay once, use anytime.</h2>
            <p className="text-body-lg" style={{ color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto' }}>
              No subscriptions. No monthly traps. Tokens don't expire. Larger packs unlock lower per-million rates.
            </p>
          </div>
          <div className="lp-pricing__grid">
            {PRICING.map(t => (
              <div key={t.name} className={`lp-tier ${t.featured ? 'lp-tier--featured' : ''}`}>
                {t.badge && (
                  <div className={`lp-tier__badge lp-tier__badge--${t.featured ? 'accent' : 'success'}`}>
                    {t.badge}
                  </div>
                )}
                <div className="lp-tier__head">
                  <span className="lp-tier__icon">{t.icon}</span>
                  <span className="lp-tier__name mono-label">{t.name.toUpperCase()}</span>
                </div>
                <p className="lp-tier__sub">{t.sub}</p>
                <div className="lp-tier__tokens">
                  <span className="lp-tier__tokens-value mono">{t.tokens}</span>
                  <span className="lp-tier__tokens-label">tokens</span>
                </div>
                <div className="lp-tier__price">
                  <span className="lp-tier__price-value mono">{t.price}</span>
                  <span className="lp-tier__price-label">one-time</span>
                </div>
                <div className="lp-tier__per-m">
                  <span className="mono">{t.perM}</span> per 1M tokens
                </div>
                {t.save && <div className="lp-tier__save">{t.save}</div>}
                <ul className="lp-tier__features">
                  {t.features.map(f => (
                    <li key={f}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 'auto' }}>
                  <Link to="/register">
                    <Button variant={t.variant} size="md" style={{ width: '100%' }}>{t.cta}</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <Link to="/pricing" className="text-body-sm" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Full pricing details →
            </Link>
          </div>
        </div>
      </section>

      {/* 8. FAQ */}
      <section className="lp-faq">
        <div className="lp-faq__inner">
          <div className="section-heading" style={{ textAlign: 'center' }}>QUESTIONS</div>
          <h2 className="text-h1" style={{ textAlign: 'center', marginBottom: 48, color: 'var(--text-primary)' }}>Answered.</h2>
          <div className="lp-faq__list">
            {FAQ.map(item => (
              <details key={item.q} className="lp-faq__item">
                <summary className="lp-faq__q">
                  <span>{item.q}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <div className="lp-faq__a">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 9. ENTERPRISE */}
      <section className="lp-enterprise">
        <div className="lp-enterprise__inner">
          <div className="lp-enterprise__card">
            <Pill mono>ENTERPRISE · COMING Q4 2026</Pill>
            <h2 className="text-h2" style={{ marginTop: 16, marginBottom: 12, color: 'var(--text-primary)' }}>
              Large team? We'll be ready soon.
            </h2>
            <p className="text-body-lg" style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
              For organizations with 100+ employees, we're building SOC 2 Type II compliance, SSO (SAML/OIDC),
              audit logs, dedicated support, and custom contracts. Target: Q4 2026.
            </p>
            <p className="text-body" style={{ color: 'var(--text-tertiary)', marginBottom: 24 }}>
              Join the waitlist — you'll get founder pricing locked in for your first 2 years and be among the first 20 enterprise customers we onboard.
            </p>
            <Link to="/enterprise-waitlist">
              <Button variant="outline" size="md" rightIcon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              }>
                Join enterprise waitlist
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 10. FINAL CTA */}
      <section className="lp-final">
        <div className="lp-final__ambient" />
        <div className="lp-final__inner">
          <IntellectMark size={56} state="council" />
          <h2 className="text-h1" style={{ marginTop: 24, marginBottom: 12, color: 'var(--text-primary)' }}>
            Stop bleeding money on AI.
          </h2>
          <p className="text-body-lg" style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
            500,000 tokens free. No credit card. Takes 60 seconds.
          </p>
          <Link to="/register">
            <Button variant="primary" size="lg" rightIcon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            }>
              Start free — 500K tokens
            </Button>
          </Link>
          <div className="mono-label" style={{ marginTop: 20, opacity: 0.6 }}>NO CREDIT CARD · CANCEL ANYTIME</div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  )
}

export default LandingPage
