import { useState, useEffect, useRef } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useTokens } from '../../contexts/TokenContext'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { useToast } from '../../hooks/useToast'

interface TokenPackage {
  id: string; name: string; tokens: number; price: number
  pricePerMillion: number; description: string; savings?: string; popular?: boolean
}

interface Transaction {
  id: string; type: string; tokens: number; balanceAfter: number; description: string; createdAt: string
}

export function MobileWalletPage() {
  const { tokenBalance } = useTokens()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [packages, setPackages] = useState<TokenPackage[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [pkgRes, txRes] = await Promise.all([
          api.get('/token-wallet/packages'),
          api.get('/token-wallet/history?limit=10'),
        ])
        setPackages(pkgRes.data?.data || [])
        setTransactions(txRes.data?.data?.transactions || [])
      } catch { /* silent */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const handleBuy = async (pkg: TokenPackage | undefined) => {
    if (!pkg) { toast.error('No packages available'); return }
    try {
      const res = await api.post('/stripe/purchase-tokens', { packageId: pkg.id })
      if (res.data?.data?.checkoutUrl) {
        window.location.href = res.data.data.checkoutUrl
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Purchase failed')
    }
  }

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
    return n.toLocaleString()
  }

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Token Balance Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #7C3AED, #5B21B6)',
        borderRadius: '20px', padding: '28px 24px', color: 'white',
        boxShadow: '0 8px 32px rgba(124, 58, 237, 0.3)',
      }}>
        <p style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.7, margin: '0 0 4px' }}>
          Token Wallet
        </p>
        <p style={{ fontSize: '44px', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-1.5px', lineHeight: 1 }}>
          <AnimatedNumber value={tokenBalance} />
        </p>
        <p style={{ fontSize: '13px', opacity: 0.6, margin: '0 0 20px' }}>
          tokens available · {user?.organizationId ? 'Organization' : 'Personal plan'}
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => handleBuy(packages.find(p => p.popular) || packages[0])}
            style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'white', border: 'none', color: '#7C3AED', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
            + Buy Tokens
          </button>
          <button onClick={() => navigate('/usage')}
            style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
            ↗ Usage Stats
          </button>
        </div>
      </div>

      {/* Token Packages */}
      <div>
        <h2 style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8E8EA0', margin: '0 0 12px' }}>Token Packages</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {packages.slice(0, 6).map(pkg => (
            <div key={pkg.id} onClick={() => handleBuy(pkg)}
              style={{
                padding: '16px 12px', borderRadius: '16px', cursor: 'pointer',
                background: pkg.popular ? 'linear-gradient(135deg, #7C3AED, #6D28D9)' : 'white',
                border: pkg.popular ? 'none' : '0.5px solid rgba(0,0,0,0.08)',
                boxShadow: pkg.popular ? '0 4px 20px rgba(124,58,237,0.3)' : '0 1px 4px rgba(0,0,0,0.04)',
                position: 'relative', textAlign: 'center',
              }}>
              {pkg.popular && (
                <span style={{
                  position: 'absolute', top: '-9px', left: '50%', transform: 'translateX(-50%)',
                  fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '3px 10px',
                  borderRadius: '100px', background: '#10B981', color: 'white', letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}>
                  Best Value
                </span>
              )}
              <p style={{ fontSize: '18px', fontWeight: 800, color: pkg.popular ? 'white' : '#1A1A2E', margin: '0 0 2px', letterSpacing: '-0.5px' }}>
                {formatTokens(pkg.tokens)}
              </p>
              <p style={{ fontSize: '10px', color: pkg.popular ? 'rgba(255,255,255,0.7)' : '#8E8EA0', margin: '0 0 10px', fontWeight: 500 }}>tokens</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: pkg.popular ? 'white' : '#7C3AED', margin: 0, letterSpacing: '-0.5px' }}>
                ${pkg.price}
              </p>
              {pkg.savings && (
                <p style={{ fontSize: '10px', color: pkg.popular ? 'rgba(255,255,255,0.8)' : '#10B981', fontWeight: 700, margin: '4px 0 0' }}>
                  {pkg.savings}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>Transactions</h2>
        {transactions.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-surface)', borderRadius: '16px', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: '14px' }}>No transactions yet</p>
          </div>
        ) : (
          <div style={{ background: 'var(--color-surface)', borderRadius: '16px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            {transactions.map((tx, i) => (
              <div key={tx.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px',
                borderBottom: i < transactions.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: tx.tokens > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(124,58,237,0.1)',
                  color: tx.tokens > 0 ? '#10B981' : '#7C3AED',
                }}>
                  {tx.tokens > 0 ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.description}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                    {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: tx.tokens > 0 ? '#10B981' : 'var(--color-text-secondary)' }}>
                  {tx.tokens > 0 ? '+' : ''}{formatTokens(Math.abs(tx.tokens))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Animated count-up number display */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)
  const prevValue = useRef(0)

  useEffect(() => {
    const from = prevValue.current
    const to = value
    prevValue.current = value
    if (from === to) { setDisplay(to); return }

    const duration = 600
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setDisplay(Math.round(from + (to - from) * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [value])

  return <>{display.toLocaleString()}</>
}

export default MobileWalletPage
