import { Link } from 'react-router-dom'
import { MarketingNav } from '../../components/marketing/MarketingNav'
import { MarketingFooter } from '../../components/marketing/MarketingFooter'
import { Button } from '../../components/primitives/Button'
import { ConvoiaMark } from '../../components/brand/ConvoiaMark'

type TierVariant = 'primary' | 'secondary' | 'outline'

interface Tier {
  name: string
  icon: string
  price: string
  tokens: string
  perM: string
  badge?: string
  save?: string
  features: string[]
  cta: string
  variant: TierVariant
  featured?: boolean
}

const TIERS: Tier[] = [
  { name: 'Starter', icon: '⚡', price: '$5', tokens: '500K', perM: '$10.00',
    features: ['500,000 tokens', 'All 35+ AI models', 'Image & video generation', 'No expiry'],
    cta: 'Get started', variant: 'secondary' },
  { name: 'Standard', icon: '🚀', price: '$14', tokens: '2M', perM: '$7.00',
    badge: 'Recommended', save: 'Save 30%',
    features: ['2M tokens', 'All 35+ AI models', 'Deep Think Mode', 'Image & video generation', 'Usage analytics'],
    cta: 'Buy 2M Tokens', variant: 'outline' },
  { name: 'Popular', icon: '⭐', price: '$25', tokens: '5M', perM: '$5.00',
    badge: 'Most Popular', save: 'Save 50%',
    features: ['5M tokens', 'All 35+ AI models', 'Deep Think Mode', 'AI Agents', 'Team token allocation', 'Usage analytics'],
    cta: 'Buy 5M Tokens', variant: 'primary', featured: true },
  { name: 'Power', icon: '💎', price: '$60', tokens: '15M', perM: '$4.00',
    save: 'Save 60%',
    features: ['15M tokens', 'All 35+ AI models', 'Deep Think Mode', 'AI Agents', 'Full org hierarchy', 'Team management', 'Budget controls'],
    cta: 'Buy 15M Tokens', variant: 'secondary' },
  { name: 'Pro', icon: '🔥', price: '$190', tokens: '50M', perM: '$3.80',
    save: 'Save 62%',
    features: ['50M tokens', 'All 35+ AI models', 'Everything in Power', 'Priority support', 'Advanced analytics'],
    cta: 'Buy 50M Tokens', variant: 'secondary' },
  { name: 'Enterprise', icon: '🏢', price: 'Custom', tokens: '100M+', perM: 'Contact us',
    features: ['100M+ tokens', 'Dedicated support', 'SLA guarantee', 'SSO & SAML', 'Custom contracts'],
    cta: 'Contact sales', variant: 'secondary' },
]

const FAQ = [
  { q: 'How does token pricing work?',
    a: 'Tokens are units of AI processing. Cheap models like GPT-4o-mini use fewer tokens per message. Premium models like Claude Opus 4.6 use more. We show exact cost before each query.' },
  { q: 'Do tokens expire?',
    a: 'No. Tokens never expire. Buy once, use them whenever you need.' },
  { q: 'Can I switch between models?',
    a: 'Yes. Switch between any of 35+ models mid-conversation with one click. All under the same token balance.' },
  { q: 'Is there a free tier?',
    a: 'Yes. The Starter plan ($5) includes 500,000 tokens to try every model before committing.' },
  { q: 'How does team billing work?',
    a: 'Power plan and above support multi-user teams with per-member budgets, role-based access, and consolidated invoicing.' },
  { q: 'What happens if a provider goes down?',
    a: 'Auto Fallback automatically routes to an equivalent model from another provider. Zero downtime.' },
]

export function PricingPage() {
  return (
    <div className="pricing-page">
      <MarketingNav />

      <section className="pp-hero">
        <div className="pp-hero__ambient" />
        <div className="pp-hero__inner">
          <ConvoiaMark size={40} state="idle" />
          <div className="section-heading" style={{ marginTop: 20, marginBottom: 8 }}>Pricing</div>
          <h1 className="text-h1" style={{ marginBottom: 16, textAlign: 'center', color: 'var(--text-primary)' }}>
            Pay only for what you use.<br />No subscriptions.
          </h1>
          <p className="text-body-lg" style={{ color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 560 }}>
            Buy tokens once. Use them anytime across all 35+ AI models. Larger packs unlock lower per-million rates.
          </p>
        </div>
      </section>

      <section className="pp-tiers">
        <div className="pp-tiers__inner">
          <div className="pp-tiers__grid">
            {TIERS.map(tier => (
              <div key={tier.name} className={`lp-tier ${tier.featured ? 'lp-tier--featured' : ''}`}>
                {tier.badge && (
                  <div className={`lp-tier__badge lp-tier__badge--${tier.featured ? 'accent' : 'success'}`}>
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
                  {tier.price !== 'Custom' && <span className="lp-tier__price-label">one-time</span>}
                </div>
                <div className="lp-tier__per-m">
                  <span className="mono">{tier.perM}</span> {tier.price !== 'Custom' && 'per 1M tokens'}
                </div>
                {tier.save && <div className="lp-tier__save">{tier.save}</div>}
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
                  <Link to={tier.name === 'Enterprise' ? '/contact' : '/register'}>
                    <Button variant={tier.variant} size="md" style={{ width: '100%' }}>
                      {tier.cta}
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pp-faq">
        <div className="pp-faq__inner">
          <div className="section-heading" style={{ textAlign: 'center' }}>Frequently asked</div>
          <h2 className="text-h1" style={{ textAlign: 'center', marginBottom: 48, color: 'var(--text-primary)' }}>Questions, answered.</h2>
          <div className="pp-faq__list">
            {FAQ.map(item => (
              <details key={item.q} className="pp-faq__item">
                <summary className="pp-faq__q">
                  <span>{item.q}</span>
                  <svg className="pp-faq__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <div className="pp-faq__a">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final-cta">
        <div className="lp-final-cta__inner">
          <div className="lp-final-cta__ambient" />
          <ConvoiaMark size={48} state="council" />
          <h2 className="text-h1" style={{ marginTop: 24, marginBottom: 12, color: 'var(--text-primary)' }}>
            Start with 500K free tokens
          </h2>
          <p className="text-body-lg" style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
            No credit card required. Test every model before you spend a cent.
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

export default PricingPage
