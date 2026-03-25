import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, ArrowRight, Globe, DollarSign, Building2, Clock, Shield, Brain,
  Check, ChevronRight, ChevronDown, Bot, Sparkles, Calculator, Star, Quote, Send, X,
} from 'lucide-react'
import { useState, useMemo, useRef, useEffect } from 'react'
import { ThemeToggle } from '../../components/shared/ThemeToggle'
import api from '../../lib/api'

const features = [
  { icon: <Globe size={24} />, title: 'Universal Gateway', description: 'Access GPT-4o, Claude, Gemini, DeepSeek, Mistral, and Llama through a single API.' },
  { icon: <DollarSign size={24} />, title: 'Cost Tracking', description: 'Real-time cost per query, per user, per team. Know exactly where every dollar goes.' },
  { icon: <Building2 size={24} />, title: 'Enterprise Hierarchy', description: 'Organizations, teams, managers, budgets. Built for how real companies work.' },
  { icon: <Clock size={24} />, title: 'Pay-Per-Hour Sessions', description: 'Buy dedicated model time. Perfect for intensive research or coding sessions.' },
  { icon: <Shield size={24} />, title: 'Auto Fallback', description: 'Set budget caps with automatic model downgrade. Never get a surprise bill.' },
  { icon: <Brain size={24} />, title: 'Industry AI', description: 'Optimized prompts for Legal, Healthcare, Finance, HR, and Marketing.' },
]

const providers = [
  { name: 'OpenAI', models: 'GPT-5.4, GPT-4.1, o3, o4', color: '#10B981' },
  { name: 'Anthropic', models: 'Claude Opus 4.6, Sonnet 4.6, Haiku 4.5', color: '#D97706' },
  { name: 'Google', models: 'Gemini 3.1 Pro, 2.5 Flash, Image Gen', color: '#3B82F6' },
  { name: 'DeepSeek', models: 'DeepSeek Chat, Reasoner', color: '#8B5CF6' },
  { name: 'Mistral', models: 'Mistral Large, Mistral Small', color: '#EF4444' },
  { name: 'Groq', models: 'Llama 3.3 70B, Mixtral 8x7B', color: '#F97316' },
]

// ── Token packages (pay-as-you-go, no subscriptions) ──────────────────

interface TokenPackage {
  name: string
  price: number
  tokens: number
  pricePerMillion: number
  features: string[]
  popular: boolean
  cta: string
  icon: string
  savings: string | null
  miniMsgs: number
  proMsgs: number
}

const plans: TokenPackage[] = [
  {
    name: 'Basic',
    price: 1,
    tokens: 500_000,
    pricePerMillion: 2.00,
    icon: '⚡',
    savings: null,
    features: [
      '500,000 tokens',
      'All 35+ AI models',
      'Image generation',
      'No expiry — use anytime',
    ],
    popular: false,
    cta: 'Buy 500K Tokens',
    miniMsgs: 1_000,
    proMsgs: 333,
  },
  {
    name: 'Standard',
    price: 2,
    tokens: 1_000_000,
    pricePerMillion: 2.00,
    icon: '🔥',
    savings: null,
    features: [
      '1,000,000 tokens',
      'All 35+ AI models',
      'Image generation',
      'Usage analytics',
      'API access',
    ],
    popular: false,
    cta: 'Buy 1M Tokens',
    miniMsgs: 2_000,
    proMsgs: 667,
  },
  {
    name: 'Popular',
    price: 8,
    tokens: 5_000_000,
    pricePerMillion: 1.60,
    icon: '🚀',
    savings: 'Save 20%',
    features: [
      '5,000,000 tokens',
      'All 35+ AI models + priority',
      'Image generation',
      'Team token allocation',
      'Usage analytics',
      'API access',
    ],
    popular: true,
    cta: 'Buy 5M Tokens',
    miniMsgs: 10_000,
    proMsgs: 3_333,
  },
  {
    name: 'Power',
    price: 14,
    tokens: 10_000_000,
    pricePerMillion: 1.40,
    icon: '💎',
    savings: 'Save 30%',
    features: [
      '10,000,000 tokens',
      'All 35+ AI models + priority',
      'Image generation',
      'Full org hierarchy',
      'Team management',
      'Budget controls',
      'Dedicated support',
    ],
    popular: false,
    cta: 'Buy 10M Tokens',
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
  // Token-based pricing — no subscription toggle needed
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
            <span className="text-xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-end))' }}>ConvoiaAI</span>
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
            <Link to="/register" className="hover:brightness-110 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-all" style={{ background: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-mid))', boxShadow: '0 4px 14px rgba(37,99,235,0.25)' }}>
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
            Now with 35+ AI models
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-7xl font-bold text-text-primary mb-6 leading-tight tracking-tight"
          >
            One platform.
            <br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-mid), var(--color-accent-end))' }}>
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
            <Link to="/register" className="inline-flex items-center gap-2 hover:brightness-110 text-white font-semibold px-7 py-3.5 rounded-xl transition-all" style={{ background: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-mid))', boxShadow: '0 4px 20px rgba(37,99,235,0.3)' }}>
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
            { value: '35+', label: 'AI Models' },
            { value: '6', label: 'Providers' },
            { value: '99.9%', label: 'Uptime' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-end))' }}>{stat.value}</p>
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
              Every major model. One platform.
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
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">Pay only for what you use</h2>
            <p className="text-text-secondary mb-6">Buy tokens once. Use them anytime. No subscriptions. No monthly fees.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, i) => {
              const isRecommended = calcResult.recommended === plan.name

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

                  {/* Icon + name */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{plan.icon}</span>
                    <p className="text-sm font-medium text-text-muted uppercase tracking-wide">{plan.name}</p>
                  </div>

                  {/* Token amount — PROMINENT */}
                  <div className="mb-1">
                    <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-primary)' }}>
                      {plan.tokens >= 1_000_000
                        ? `${plan.tokens / 1_000_000}M`
                        : `${plan.tokens / 1_000}K`}
                    </span>
                    <span className="text-text-muted text-sm ml-1">tokens</span>
                  </div>

                  {/* Price */}
                  <div className="mb-1">
                    <span className="text-3xl font-bold text-text-primary">${plan.price.toFixed(2)}</span>
                    <span className="text-text-muted text-sm ml-1">one-time</span>
                  </div>
                  <p className="text-xs text-text-muted mb-1">${plan.pricePerMillion.toFixed(2)} per 1M tokens</p>
                  {plan.savings && (
                    <span className="inline-block px-2 py-0.5 bg-success/10 text-success text-xs font-semibold rounded-full mb-2">
                      {plan.savings}
                    </span>
                  )}

                  {/* Helper text */}
                  <p style={{ fontSize: '11px', color: '#8E8E8E', marginTop: '4px' }}>
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
            Tokens never expire. Buy once, use anytime across all 35+ AI models.
            1 token &asymp; 0.75 words &middot; Larger packages = lower cost per token.
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
              <Link to="/register" className="inline-flex items-center gap-2 hover:brightness-110 text-white font-semibold px-8 py-3.5 rounded-xl transition-all text-lg" style={{ background: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-mid))', boxShadow: '0 4px 20px rgba(37,99,235,0.3)' }}>
                Start for free
                <ArrowRight size={20} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Reviews Section */}
      <ReviewsSection />

      {/* Footer */}
      <footer className="border-t border-border/50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Zap size={20} className="text-primary" />
              <span className="font-bold bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-end))' }}>ConvoiaAI</span>
            </div>
            <p className="text-sm text-text-muted">&copy; {new Date().getFullYear()} ConvoiaAI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ============== REVIEWS SECTION ==============
function ReviewsSection() {
  const [reviews, setReviews] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ rating: 5, title: '', content: '', role: '', company: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    api.get('/reviews').then(r => setReviews(r.data?.data || [])).catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim()) return
    setSubmitting(true)
    try {
      await api.post('/reviews', form)
      setSubmitted(true)
      setShowForm(false)
      setForm({ rating: 5, title: '', content: '', role: '', company: '' })
      api.get('/reviews').then(r => setReviews(r.data?.data || []))
    } catch { /* user not logged in */ }
    setSubmitting(false)
  }

  const StarRating = ({ rating, interactive, onChange }: { rating: number; interactive?: boolean; onChange?: (r: number) => void }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={interactive ? 24 : 14}
          className={`transition-colors ${i <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'} ${interactive ? 'cursor-pointer hover:scale-110' : ''}`}
          onClick={() => interactive && onChange?.(i)}
        />
      ))}
    </div>
  )

  const avgRating = reviews.length > 0 ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1) : '5.0'

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px',
      }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-4 py-1.5 mb-6">
            <Star size={14} className="text-yellow-400 fill-yellow-400" />
            <span className="text-sm font-medium text-yellow-400">
              {reviews.length > 0 ? `${avgRating} average from ${reviews.length} review${reviews.length !== 1 ? 's' : ''}` : 'Be the first to review'}
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">What our users say</h2>
          <p className="text-text-secondary max-w-2xl mx-auto mb-8">Real feedback from teams and individuals using ConvoiaAI every day.</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 hover:brightness-110 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm"
            style={{ background: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-mid))' }}
          >
            <Send size={16} />
            Write a Review
          </button>
        </motion.div>

        {/* Review Cards */}
        {reviews.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {reviews.map((review, i) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative group"
              >
                <div className={`h-full rounded-2xl p-6 border transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 ${
                  review.isFeatured
                    ? 'bg-gradient-to-br from-primary/10 to-accent-end/5 border-primary/20'
                    : 'bg-surface border-border'
                }`}>
                  {review.isFeatured && (
                    <div className="absolute -top-3 left-6 bg-gradient-to-r from-accent-start to-accent-mid text-white text-xs font-bold px-3 py-1 rounded-full">
                      Featured
                    </div>
                  )}
                  <Quote size={24} className="text-primary/20 mb-3" />
                  <h4 className="font-semibold text-text-primary text-lg mb-2">{review.title}</h4>
                  <p className="text-text-secondary text-sm leading-relaxed mb-4">{review.content}</p>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent-end flex items-center justify-center text-white font-bold text-sm">
                        {review.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{review.name}</p>
                        {(review.role || review.company) && (
                          <p className="text-xs text-text-muted">{[review.role, review.company].filter(Boolean).join(' at ')}</p>
                        )}
                      </div>
                    </div>
                    <StarRating rating={review.rating} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Quote size={48} className="text-primary/10 mx-auto mb-4" />
            <p className="text-text-muted text-lg">No reviews yet. Be the first to share your experience!</p>
          </div>
        )}
      </div>

      {/* Review Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface border border-border rounded-2xl p-8 w-full max-w-lg shadow-2xl"
            >
              {submitted ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check size={32} className="text-green-400" />
                  </div>
                  <h3 className="text-xl font-bold text-text-primary mb-2">Thank you!</h3>
                  <p className="text-text-secondary">Your review has been submitted and is now visible on the homepage.</p>
                  <button onClick={() => { setShowForm(false); setSubmitted(false) }} className="mt-6 px-6 py-2 bg-primary text-white rounded-xl font-medium">Done</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-text-primary">Write a Review</h3>
                    <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-text-muted"><X size={20} /></button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-text-secondary mb-2 block">Rating</label>
                      <StarRating rating={form.rating} interactive onChange={r => setForm(f => ({ ...f, rating: r }))} />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-text-secondary mb-1 block">Title *</label>
                      <input
                        value={form.title}
                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="Great AI platform for our team"
                        className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-text-secondary mb-1 block">Review *</label>
                      <textarea
                        value={form.content}
                        onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                        placeholder="Tell us about your experience with ConvoiaAI..."
                        rows={4}
                        className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-text-secondary mb-1 block">Your Role</label>
                        <input
                          value={form.role}
                          onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                          placeholder="CTO, Developer, etc."
                          className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-text-secondary mb-1 block">Company</label>
                        <input
                          value={form.company}
                          onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                          placeholder="Acme Corp"
                          className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none text-sm"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !form.title.trim() || !form.content.trim()}
                      className="w-full hover:brightness-110 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-mid))' }}
                    >
                      {submitting ? 'Submitting...' : <><Send size={16} /> Submit Review</>}
                    </button>
                    <p className="text-xs text-text-muted text-center">You need to be logged in to submit a review.</p>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export default LandingPage;
