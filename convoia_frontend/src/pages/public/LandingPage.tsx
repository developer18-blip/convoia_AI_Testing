import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Zap, ArrowRight, Globe, DollarSign, Building2, Clock, Shield, Brain,
  Check, ChevronRight, ChevronDown, Bot, Sparkles, Calculator,
} from 'lucide-react'
import { useState, useMemo, useRef, useEffect } from 'react'
import { ThemeToggle } from '../../components/shared/ThemeToggle'

const features = [
  { icon: <Globe size={24} />, title: 'Universal Gateway', description: 'Access GPT-4o, Claude, Gemini, DeepSeek, Mistral, and Llama through a single API.' },
  { icon: <DollarSign size={24} />, title: 'Cost Tracking', description: 'Real-time cost per query, per user, per team. Know exactly where every dollar goes.' },
  { icon: <Building2 size={24} />, title: 'Enterprise Hierarchy', description: 'Organizations, teams, managers, budgets. Built for how real companies work.' },
  { icon: <Clock size={24} />, title: 'Pay-Per-Hour Sessions', description: 'Buy dedicated model time. Perfect for intensive research or coding sessions.' },
  { icon: <Shield size={24} />, title: 'Auto Fallback', description: 'Set budget caps with automatic model downgrade. Never get a surprise bill.' },
  { icon: <Brain size={24} />, title: 'Industry AI', description: 'Optimized prompts for Legal, Healthcare, Finance, HR, and Marketing.' },
]

const providers = [
  { name: 'OpenAI', models: 'GPT-4o, GPT-4o-mini', color: '#10B981' },
  { name: 'Anthropic', models: 'Claude 4 Sonnet, Claude 3.5 Haiku', color: '#D97706' },
  { name: 'Google', models: 'Gemini 2.0 Flash, Gemini Pro', color: '#3B82F6' },
  { name: 'DeepSeek', models: 'DeepSeek V3, DeepSeek R1', color: '#8B5CF6' },
  { name: 'Mistral', models: 'Mistral Large, Mistral Small', color: '#EF4444' },
  { name: 'Groq', models: 'Llama 3.3 70B', color: '#F97316' },
]

// ── Token-based pricing plans ──────────────────────────────────────────

interface PricingPlan {
  name: string
  price: number
  yearlyPrice: number
  tokens: number
  tokenLabel: string
  features: string[]
  popular: boolean
  cta: string
  miniMsgs: number   // ~messages with GPT-4o-mini (500 tok/msg)
  proMsgs: number     // ~messages with GPT-4o (1500 tok/msg)
}

const plans: PricingPlan[] = [
  {
    name: 'Free',
    price: 0,
    yearlyPrice: 0,
    tokens: 50_000,
    tokenLabel: '50K tokens/mo',
    features: [
      '50,000 tokens/month',
      '3 models (GPT-4o-mini, Gemini Flash, DeepSeek)',
      'Basic dashboard',
      'Community support',
      'Pay-per-query after limit',
    ],
    popular: false,
    cta: 'Get Started Free',
    miniMsgs: 100,
    proMsgs: 33,
  },
  {
    name: 'Starter',
    price: 9,
    yearlyPrice: 7,
    tokens: 500_000,
    tokenLabel: '500K tokens/mo',
    features: [
      '500,000 tokens/month',
      'All 16 models',
      'Usage analytics',
      'Email support',
      'API access',
      'Pay-per-query after limit',
    ],
    popular: false,
    cta: 'Start Free Trial',
    miniMsgs: 1_000,
    proMsgs: 333,
  },
  {
    name: 'Pro',
    price: 29,
    yearlyPrice: 23,
    tokens: 2_000_000,
    tokenLabel: '2M tokens/mo',
    features: [
      '2,000,000 tokens/month',
      'All models + priority access',
      'Team management (up to 10 members)',
      'Budget controls',
      'Priority support',
      'Hourly sessions',
      'Pay-per-query after limit',
    ],
    popular: true,
    cta: 'Start Free Trial',
    miniMsgs: 4_000,
    proMsgs: 1_333,
  },
  {
    name: 'Business',
    price: 99,
    yearlyPrice: 79,
    tokens: 10_000_000,
    tokenLabel: '10M tokens/mo',
    features: [
      '10,000,000 tokens/month',
      'Unlimited team members',
      'Full org hierarchy',
      'Custom integrations',
      'SLA guarantee',
      'Dedicated support',
      'SSO (coming soon)',
      'Pay-per-query after limit',
    ],
    popular: false,
    cta: 'Start Free Trial',
    miniMsgs: 20_000,
    proMsgs: 6_667,
  },
]

// ── Token calculator ───────────────────────────────────────────────────

const calcModels = [
  { label: 'GPT-4o', avgTokens: 1500 },
  { label: 'GPT-4o-mini', avgTokens: 500 },
  { label: 'Claude Sonnet', avgTokens: 1500 },
  { label: 'Claude Haiku', avgTokens: 500 },
  { label: 'Gemini Pro', avgTokens: 1200 },
  { label: 'Gemini Flash', avgTokens: 400 },
  { label: 'DeepSeek', avgTokens: 600 },
  { label: 'Llama 70B', avgTokens: 600 },
]

function getRecommendedPlan(monthlyTokens: number): string {
  if (monthlyTokens <= 50_000) return 'Free'
  if (monthlyTokens <= 500_000) return 'Starter'
  if (monthlyTokens <= 2_000_000) return 'Pro'
  return 'Business'
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString()
}

// ── Other constants ────────────────────────────────────────────────────

const steps = [
  { num: '01', title: 'Create your account', description: 'Sign up in 30 seconds. No credit card required for the free tier.' },
  { num: '02', title: 'Choose your model', description: 'Pick from 16+ AI models across 6 providers. Compare pricing and capabilities.' },
  { num: '03', title: 'Start building', description: 'Use our chat interface or API. Track costs in real-time. Scale when ready.' },
]

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.5, ease: 'easeOut' as const },
}

export function LandingPage() {
  const [yearly, setYearly] = useState(false)
  const [messagesPerDay, setMessagesPerDay] = useState(20)
  const [calcModelIdx, setCalcModelIdx] = useState(0)
  const [calcDropdownOpen, setCalcDropdownOpen] = useState(false)
  const calcDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (calcDropdownRef.current && !calcDropdownRef.current.contains(e.target as Node)) {
        setCalcDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const calcResult = useMemo(() => {
    const model = calcModels[calcModelIdx]
    const monthlyTokens = messagesPerDay * 30 * model.avgTokens
    const recommended = getRecommendedPlan(monthlyTokens)
    return { monthlyTokens, recommended }
  }, [messagesPerDay, calcModelIdx])

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-background/70 backdrop-blur-2xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-lg blur-md" />
              <Zap size={24} className="text-primary relative" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-accent-start to-accent-end bg-clip-text text-transparent">ConvoiaAI</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Features</a>
            <a href="#pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Pricing</a>
            <a href="#how-it-works" className="text-sm text-text-secondary hover:text-text-primary transition-colors">How it Works</a>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/login" className="text-sm text-text-secondary hover:text-text-primary transition-colors px-4 py-2">
              Login
            </Link>
            <Link to="/register" className="bg-gradient-to-r from-accent-start to-accent-mid hover:brightness-110 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-all shadow-lg shadow-primary/20">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-24 pb-28 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute -top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-primary/12 via-accent-end/5 to-transparent rounded-full blur-3xl" />
          <div className="absolute inset-0 opacity-[0.015]" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }} />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8"
          >
            <Sparkles size={14} />
            Now with 16 AI models
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-7xl font-bold text-text-primary mb-6 leading-tight tracking-tight"
          >
            One platform.
            <br />
            <span className="bg-gradient-to-r from-accent-start via-accent-mid to-accent-end bg-clip-text text-transparent">
              Every AI model.
            </span>
            <br />
            Full control.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-text-secondary max-w-2xl mx-auto mb-10"
          >
            Access GPT-4o, Claude, Gemini, and more through a single dashboard.
            Track costs per query, manage team budgets, and never overspend on AI.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to="/register" className="inline-flex items-center gap-2 bg-gradient-to-r from-accent-start to-accent-mid hover:brightness-110 text-white font-semibold px-7 py-3.5 rounded-xl transition-all shadow-lg shadow-primary/25">
              Start for free
              <ArrowRight size={18} />
            </Link>
            <a href="#how-it-works" className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary font-medium px-6 py-3.5 rounded-xl border border-border hover:border-primary/40 transition-all">
              See how it works
              <ChevronRight size={18} />
            </a>
          </motion.div>

          {/* Provider cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-16 flex flex-wrap justify-center gap-3"
          >
            {providers.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5 + i * 0.05 }}
                whileHover={{ y: -2 }}
                className="bg-surface/80 backdrop-blur-sm border border-border/50 rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all"
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                <div className="text-left">
                  <p className="text-sm font-semibold text-text-primary">{p.name}</p>
                  <p className="text-xs text-text-muted">{p.models}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-8 border-y border-border/50 bg-surface/30 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 flex flex-wrap justify-center gap-16">
          {[
            { value: '16', label: 'AI Models' },
            { value: '6', label: 'Providers' },
            { value: '99.9%', label: 'Uptime' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold bg-gradient-to-r from-accent-start to-accent-end bg-clip-text text-transparent">{stat.value}</p>
              <p className="text-sm text-text-muted mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">Everything you need to manage AI</h2>
            <p className="text-text-secondary max-w-xl mx-auto">Built for teams that take AI seriously. Every feature designed for production use.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                whileHover={{ y: -4 }}
                className="bg-surface border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/15 to-accent-end/10 flex items-center justify-center text-primary mb-4 group-hover:from-primary/25 group-hover:to-accent-end/15 transition-all">
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold text-text-primary mb-2">{f.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Models */}
      <section className="py-24 bg-surface/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              Every major model. One subscription.
            </h2>
            <p className="text-text-secondary max-w-xl mx-auto mb-12">Compare pricing, switch models mid-conversation, and always get the best result for your budget.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                whileHover={{ scale: 1.02 }}
                className="bg-surface border border-border rounded-2xl p-5 text-left transition-all hover:shadow-lg"
                style={{ borderLeftColor: p.color, borderLeftWidth: '3px' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Bot size={18} style={{ color: p.color }} />
                  <h3 className="font-bold text-text-primary">{p.name}</h3>
                </div>
                <p className="text-sm text-text-muted">{p.models}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.div {...fadeUp} className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">Simple, transparent pricing</h2>
            <p className="text-text-secondary mb-6">Start free. Scale as you grow. No hidden fees.</p>
            <div className="inline-flex items-center bg-surface border border-border rounded-2xl p-1">
              <button onClick={() => setYearly(false)} className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${!yearly ? 'bg-gradient-to-r from-accent-start to-accent-mid text-white shadow-lg shadow-primary/20' : 'text-text-secondary hover:text-text-primary'}`}>Monthly</button>
              <button onClick={() => setYearly(true)} className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${yearly ? 'bg-gradient-to-r from-accent-start to-accent-mid text-white shadow-lg shadow-primary/20' : 'text-text-secondary hover:text-text-primary'}`}>Yearly <span className="text-xs opacity-70">(-20%)</span></button>
            </div>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, i) => {
              const displayPrice = yearly ? plan.yearlyPrice : plan.price
              const isRecommended = calcResult.recommended === plan.name
              const yearlySavings = (plan.price - plan.yearlyPrice) * 12

              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  whileHover={{ y: -4 }}
                  className={`bg-surface border-2 rounded-2xl p-6 relative transition-all duration-300 ${
                    plan.popular
                      ? 'border-primary shadow-xl shadow-primary/10'
                      : isRecommended
                        ? 'border-primary/60 shadow-lg shadow-primary/5'
                        : 'border-border hover:border-primary/20'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-accent-start to-accent-mid text-white text-xs font-bold rounded-full">
                      Most Popular
                    </div>
                  )}
                  {isRecommended && !plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-success/90 text-white text-xs font-bold rounded-full">
                      Recommended
                    </div>
                  )}

                  {/* Plan name */}
                  <p className="text-sm font-medium text-text-muted mb-2 uppercase tracking-wide">{plan.name}</p>

                  {/* Price */}
                  <div className="mb-3">
                    <span className="text-3xl font-bold text-text-primary">${displayPrice}</span>
                    {plan.price > 0 && <span className="text-text-muted text-sm">/mo</span>}
                    {yearly && yearlySavings > 0 && (
                      <span className="ml-2 inline-block px-2 py-0.5 bg-success/10 text-success text-xs font-semibold rounded-full">
                        Save ${yearlySavings}/yr
                      </span>
                    )}
                  </div>

                  {/* Token amount — PROMINENT */}
                  <div className="mb-1">
                    <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-primary)' }}>
                      {plan.tokens >= 1_000_000
                        ? `${plan.tokens / 1_000_000}M`
                        : `${plan.tokens / 1_000}K`} tokens
                    </span>
                  </div>
                  <p className="text-text-muted text-xs mb-1">/month</p>
                  {/* Helper text */}
                  <p style={{ fontSize: '11px', color: '#8E8E8E', marginTop: '2px' }}>
                    ~{plan.miniMsgs.toLocaleString()} messages with GPT-4o-mini
                  </p>
                  <p style={{ fontSize: '11px', color: '#8E8E8E', marginTop: '2px' }} className="mb-4">
                    ~{plan.proMsgs.toLocaleString()} messages with GPT-4o
                  </p>

                  {/* Divider */}
                  <div className="border-t border-border mb-4" />

                  {/* Features */}
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-text-secondary">
                        <Check size={16} className="text-success mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Link
                    to="/register"
                    className={`block text-center py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      plan.popular
                        ? 'bg-gradient-to-r from-accent-start to-accent-mid text-white shadow-lg shadow-primary/20 hover:brightness-110'
                        : 'bg-surface-2 hover:bg-surface-3 text-text-primary border border-border'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </motion.div>
              )
            })}
          </div>

          {/* Note below cards */}
          <p className="text-center text-sm text-text-muted mt-8 max-w-2xl mx-auto">
            All plans include pay-per-query pricing when monthly tokens are exhausted.
            1 token &asymp; 0.75 words &middot; Hourly sessions available on Pro and Business.
          </p>

          {/* ── Token Calculator ───────────────────────────────────────── */}
          <motion.div
            {...fadeUp}
            className="mt-16 max-w-2xl mx-auto bg-surface border border-border rounded-2xl p-6 sm:p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Calculator size={20} className="text-primary" />
              </div>
              <h3 className="text-xl font-bold text-text-primary">How many tokens do you need?</h3>
            </div>

            <div className="space-y-5">
              {/* Messages per day */}
              <div>
                <label className="text-sm text-text-secondary mb-2 block">
                  I send approximately <strong className="text-text-primary">{messagesPerDay}</strong> messages per day
                </label>
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={messagesPerDay}
                  onChange={(e) => setMessagesPerDay(Number(e.target.value))}
                  className="w-full h-2 bg-surface-2 rounded-full appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-text-muted mt-1">
                  <span>1</span>
                  <span>50</span>
                  <span>100</span>
                  <span>150</span>
                  <span>200</span>
                </div>
              </div>

              {/* Model selector */}
              <div>
                <label className="text-sm text-text-secondary mb-2 block">Using:</label>
                <div ref={calcDropdownRef} className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => setCalcDropdownOpen(!calcDropdownOpen)}
                    className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 hover:border-primary/40 transition-colors min-w-[180px] justify-between"
                  >
                    <span>{calcModels[calcModelIdx].label}</span>
                    <ChevronDown size={14} className={`text-text-muted transition-transform ${calcDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {calcDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-surface-2 border border-border rounded-lg shadow-xl overflow-hidden">
                      {calcModels.map((m, idx) => (
                        <button
                          key={m.label}
                          type="button"
                          onClick={() => { setCalcModelIdx(idx); setCalcDropdownOpen(false) }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            idx === calcModelIdx
                              ? 'bg-primary/10 text-primary'
                              : 'text-text-primary hover:bg-primary/5'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Result */}
              <div className="bg-surface-2 rounded-xl p-4 border border-border/50">
                <p className="text-sm text-text-secondary mb-1">You need approximately</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                  {formatTokenCount(calcResult.monthlyTokens)} tokens/month
                </p>
                <p className="text-sm text-text-secondary mt-2">
                  Recommended plan:{' '}
                  <span className="font-bold text-text-primary">{calcResult.recommended}</span>
                  {' '}
                  <Check size={14} className="inline text-success" />
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24 bg-surface/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <motion.h2 {...fadeUp} className="text-3xl sm:text-4xl font-bold text-text-primary text-center mb-16">How it works</motion.h2>
          <div className="space-y-12">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex gap-6 items-start"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-accent-end/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                  {step.num}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-text-primary mb-2">{step.title}</h3>
                  <p className="text-text-secondary">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <motion.div
            {...fadeUp}
            className="relative bg-gradient-to-br from-primary/15 via-accent-mid/10 to-accent-end/15 border border-primary/20 rounded-3xl p-12 overflow-hidden"
          >
            <div className="absolute inset-0 opacity-[0.03]" style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
              backgroundSize: '24px 24px',
            }} />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">Ready to take control of your AI spend?</h2>
              <p className="text-text-secondary mb-8 max-w-lg mx-auto">Join teams who manage their AI costs without sacrificing capability.</p>
              <Link to="/register" className="inline-flex items-center gap-2 bg-gradient-to-r from-accent-start to-accent-mid hover:brightness-110 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-primary/25 text-lg">
                Start for free
                <ArrowRight size={20} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Zap size={20} className="text-primary" />
              <span className="font-bold bg-gradient-to-r from-accent-start to-accent-end bg-clip-text text-transparent">ConvoiaAI</span>
            </div>
            <p className="text-sm text-text-muted">&copy; {new Date().getFullYear()} ConvoiaAI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage;
