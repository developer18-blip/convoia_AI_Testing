import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Shield, Lock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTokens } from '../contexts/TokenContext'
import { useToast } from '../hooks/useToast'
import api from '../lib/api'

interface TokenPackage {
  id: string
  name: string
  tokens: number
  price: number
  pricePerMillion: number
  description: string
  savings: string | null
  popular: boolean
  color: string
  icon: string
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function TokenStorePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { formattedBalance, refresh } = useTokens()
  const [packages, setPackages] = useState<TokenPackage[]>([])
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Block employees and managers from buying tokens
  const canBuyTokens = !user?.organizationId ||
    user?.role === 'org_owner' ||
    user?.role === 'platform_admin'

  if (!canBuyTokens) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '60vh', textAlign: 'center', padding: '40px',
      }}>
        <Lock size={48} style={{ color: '#55556A', marginBottom: '16px' }} />
        <h2 style={{ color: '#ECECEC', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
          Token purchases not available
        </h2>
        <p style={{ color: '#8E8E8E', fontSize: '14px', lineHeight: 1.6, maxWidth: '400px' }}>
          Your organization manages your token budget.
          Contact your manager or organization owner
          if you need more tokens.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            marginTop: '24px', padding: '10px 24px', backgroundColor: '#7C3AED',
            border: 'none', borderRadius: '10px', color: 'white', cursor: 'pointer', fontSize: '14px',
          }}
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  useEffect(() => {
    api.get('/token-wallet/packages')
      .then(res => setPackages(res.data.data || []))
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  // Handle Stripe redirect — read directly from window.location to avoid React timing issues
  const [redirectHandled, setRedirectHandled] = useState(false)
  useEffect(() => {
    if (redirectHandled) return
    const params = new URLSearchParams(window.location.search)
    const isSuccess = params.get('success') === 'true'
    const sessionId = params.get('session_id')
    const isCancelled = params.get('cancelled') === 'true'

    if (!isSuccess && !isCancelled) return
    setRedirectHandled(true)

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname)

    if (isCancelled) {
      toast.info('Purchase cancelled.')
      return
    }

    if (isSuccess && sessionId) {
      toast.info('Verifying payment...')
      api.get(`/stripe/verify-session/${sessionId}`)
        .then(res => {
          const data = res.data.data
          toast.success(`${data?.packageName || 'Tokens'} purchased! ${data?.formatted || ''} tokens added.`)
          refresh()
          window.dispatchEvent(new Event('tokens:refresh'))
        })
        .catch(err => {
          toast.error('Could not verify payment. Please refresh the page.')
          setTimeout(() => { refresh(); window.dispatchEvent(new Event('tokens:refresh')) }, 3000)
        })
    } else if (isSuccess) {
      toast.success('Payment successful! Tokens may take a moment to appear.')
      refresh()
      setTimeout(() => { refresh(); window.dispatchEvent(new Event('tokens:refresh')) }, 3000)
    }
  }, [redirectHandled])

  const handleBuy = async (packageId: string) => {
    setBuyingId(packageId)
    try {
      const res = await api.post('/stripe/purchase-tokens', { packageId })
      const url = res.data.data?.checkoutUrl
      if (url) window.location.href = url
      else toast.error('Failed to create checkout')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Purchase failed')
    } finally {
      setBuyingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">Buy Tokens</h2>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Buy Tokens</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Power your AI conversations. Tokens never expire.</p>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-end))',
          borderRadius: '16px', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px',
          boxShadow: '0 4px 20px rgba(124,58,237,0.25)',
        }}>
          <Zap size={22} style={{ color: 'white' }} />
          <div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '2px' }}>Your Balance</p>
            <p style={{ fontSize: '22px', fontWeight: 800, color: 'white', fontFamily: 'monospace', margin: 0 }}>
              {formattedBalance} tokens
            </p>
          </div>
        </div>
      </div>

      {/* Package grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {packages.map(pkg => {
          const isPopular = pkg.popular
          return (
            <div
              key={pkg.id}
              className="relative rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              style={{
                background: isPopular
                  ? 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-mid), var(--color-accent-end))'
                  : 'var(--color-surface)',
                border: isPopular ? 'none' : '1px solid var(--color-border)',
                padding: '28px',
                cursor: 'pointer',
                boxShadow: isPopular
                  ? '0 8px 32px rgba(124,58,237,0.3)'
                  : '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              {isPopular && (
                <div style={{
                  position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)',
                  background: 'white', color: 'var(--color-accent-start)',
                  padding: '5px 22px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                  letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  boxShadow: '0 2px 12px rgba(124,58,237,0.2)',
                }}>
                  Most Popular
                </div>
              )}

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '24px' }}>{pkg.icon}</span>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: isPopular ? 'white' : 'var(--color-text-primary)' }}>{pkg.name}</span>
                </div>
                {pkg.savings && (
                  <span style={{
                    background: isPopular ? 'rgba(255,255,255,0.2)' : 'rgba(16,185,129,0.1)',
                    border: isPopular ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(16,185,129,0.2)',
                    color: isPopular ? 'white' : '#10B981',
                    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                  }}>
                    {pkg.savings}
                  </span>
                )}
              </div>

              <p style={{ fontSize: '44px', fontWeight: 900, color: isPopular ? 'white' : pkg.color, margin: '16px 0 4px', letterSpacing: '-1px' }}>
                {fmtTokens(pkg.tokens)}
              </p>
              <p style={{ fontSize: '13px', color: isPopular ? 'rgba(255,255,255,0.6)' : 'var(--color-text-muted)', marginBottom: '4px' }}>tokens</p>

              <p style={{ fontSize: '28px', fontWeight: 800, color: isPopular ? 'white' : 'var(--color-text-primary)', margin: '8px 0 4px' }}>
                ${pkg.price.toFixed(2)}
              </p>
              <p style={{ fontSize: '12px', color: isPopular ? 'rgba(255,255,255,0.5)' : 'var(--color-text-muted)', marginBottom: '8px' }}>
                ${pkg.pricePerMillion.toFixed(2)} per 1M tokens
              </p>

              <p style={{ fontSize: '13px', color: isPopular ? 'rgba(255,255,255,0.7)' : 'var(--color-text-secondary)', marginBottom: '20px' }}>
                {pkg.description}
              </p>

              <button
                onClick={() => handleBuy(pkg.id)}
                disabled={buyingId === pkg.id}
                style={{
                  width: '100%', padding: '12px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
                  cursor: buyingId === pkg.id ? 'not-allowed' : 'pointer', transition: 'all 200ms',
                  background: isPopular ? 'white' : 'linear-gradient(135deg, var(--color-accent-start), var(--color-accent-mid))',
                  border: 'none',
                  color: isPopular ? 'var(--color-accent-start)' : 'white',
                  boxShadow: isPopular ? '0 2px 12px rgba(255,255,255,0.3)' : '0 2px 12px rgba(124,58,237,0.25)',
                }}
              >
                {buyingId === pkg.id ? 'Processing...' : `Buy ${fmtTokens(pkg.tokens)} Tokens`}
              </button>
            </div>
          )
        })}
      </div>

      {/* Info section */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
          Frequently Asked Questions
        </h3>
        <div className="space-y-4">
          {[
            { q: 'Do tokens expire?', a: 'Never. Your tokens stay in your account forever.' },
            { q: 'What counts as a token?', a: 'Roughly 4 characters of text. A typical message uses 200-500 tokens.' },
            { q: 'Can I use tokens on all models?', a: 'Yes — all 35 AI models draw from the same token balance.' },
            { q: 'Can org owners share tokens?', a: 'Yes. Owners can allocate tokens to managers, who can then allocate to employees.' },
          ].map(faq => (
            <div key={faq.q}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>{faq.q}</p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{faq.a}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-6 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Shield size={14} style={{ color: 'var(--color-text-muted)' }} />
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Secured by Stripe. We never store your card details.</p>
        </div>
      </div>

    </div>
  )
}

export default TokenStorePage
