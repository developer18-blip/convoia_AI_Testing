import { useState, useEffect, useRef } from 'react'
import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react'
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
  const { tokenBalance, refresh: refreshTokens } = useTokens()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [packages, setPackages] = useState<TokenPackage[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const isEmployee = !!user?.organizationId && user?.role !== 'org_owner' && user?.role !== 'platform_admin'
  const canBuy = !isEmployee

  const loadData = async () => {
    try {
      const [pkgRes, txRes] = await Promise.all([
        api.get('/token-wallet/packages'),
        api.get('/token-wallet/history?limit=20'),
      ])
      setPackages(pkgRes.data?.data || [])
      setTransactions(txRes.data?.data?.transactions || [])
    } catch { /* silent */ }
    finally { setIsLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([loadData(), refreshTokens()])
    setIsRefreshing(false)
    toast.success('Wallet refreshed')
  }

  const handleBuy = async (pkg: TokenPackage | undefined) => {
    if (!pkg) { toast.error('No packages available'); return }
    try {
      const res = await api.post('/stripe/purchase-tokens', { packageId: pkg.id })
      if (res.data?.data?.checkoutUrl) {
        window.open(res.data.data.checkoutUrl, '_system')
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

  const getTypeIcon = (type: string, tokens: number) => {
    if (type === 'purchase' || tokens > 0) return { icon: <ArrowDownRight size={16} />, color: '#10B981', bg: 'rgba(16,185,129,0.1)' }
    return { icon: <ArrowUpRight size={16} />, color: '#7C3AED', bg: 'rgba(124,58,237,0.1)' }
  }

  if (isLoading) {
    return (
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: i === 1 ? '180px' : '80px', borderRadius: '16px', background: '#F0EDF8', animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Token Balance Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #7C3AED, #5B21B6)',
        borderRadius: '20px', padding: '28px 24px', color: 'white',
        boxShadow: '0 8px 32px rgba(124, 58, 237, 0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6, margin: 0 }}>
            Token Wallet
          </p>
          <button onClick={handleRefresh} disabled={isRefreshing}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'white' }}>
            <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
        <p style={{ fontSize: '44px', fontWeight: 800, margin: '8px 0 4px', letterSpacing: '-1.5px', lineHeight: 1 }}>
          <AnimatedNumber value={tokenBalance} />
        </p>
        <p style={{ fontSize: '13px', opacity: 0.6, margin: '0 0 20px' }}>
          tokens available · {user?.organizationId ? 'Organization' : 'Personal plan'}
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          {canBuy && (
            <button onClick={() => handleBuy(packages.find(p => p.popular) || packages[0])}
              style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'white', border: 'none', color: '#7C3AED', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
              + Buy Tokens
            </button>
          )}
          <button onClick={() => navigate('/usage')}
            style={{ flex: 1, padding: '12px', borderRadius: '12px', background: canBuy ? 'rgba(255,255,255,0.15)' : 'white', border: '1px solid rgba(255,255,255,0.25)', color: canBuy ? 'white' : '#7C3AED', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
            Usage Stats
          </button>
        </div>
      </div>

      {/* Token Packages — hidden for employees */}
      {canBuy && <div>
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
      </div>}

      {/* Transaction History */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 12px' }}>
          <h2 style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8E8EA0', margin: 0 }}>Transactions</h2>
          <span style={{ fontSize: '11px', color: '#8E8EA0' }}>{transactions.length} total</span>
        </div>
        {transactions.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', background: 'white', borderRadius: '16px', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: '28px', margin: '0 0 8px' }}>📭</p>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A1A2E', margin: '0 0 4px' }}>No transactions yet</p>
            <p style={{ fontSize: '12px', color: '#8E8EA0', margin: 0 }}>Buy tokens or start chatting to see history</p>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: '16px', border: '0.5px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            {transactions.map((tx, i) => {
              const { icon, color, bg } = getTypeIcon(tx.type, tx.tokens)
              return (
                <div key={tx.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px',
                  borderBottom: i < transactions.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: bg, color,
                  }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A2E', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.description}
                    </p>
                    <p style={{ fontSize: '11px', color: '#8E8EA0', margin: '2px 0 0' }}>
                      {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' · '}
                      {tx.type === 'purchase' ? 'Purchase' : tx.type === 'usage' ? 'Usage' : tx.type === 'allocation_received' ? 'Received' : tx.type === 'allocation_given' ? 'Sent' : tx.type}
                    </p>
                  </div>
                  <span style={{
                    fontSize: '14px', fontWeight: 700, fontFamily: 'monospace',
                    color: tx.tokens > 0 ? '#10B981' : '#8E8EA0',
                  }}>
                    {tx.tokens > 0 ? '+' : ''}{formatTokens(Math.abs(tx.tokens))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Spin animation for refresh icon */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
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
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [value])

  return <>{display.toLocaleString()}</>
}

export default MobileWalletPage
