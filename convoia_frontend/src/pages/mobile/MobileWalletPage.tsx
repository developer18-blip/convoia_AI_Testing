import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, BarChart3, CreditCard, RefreshCw, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { useTokens } from '../../contexts/TokenContext'
import { useAuth } from '../../hooks/useAuth'
import api from '../../lib/api'
import { useToast } from '../../hooks/useToast'

interface TokenPackage {
  id: string
  name: string
  tokens: number
  price: number
  pricePerMillion: number
  description: string
  savings?: string
  popular?: boolean
}

interface Transaction {
  id: string
  type: string
  tokens: number
  balanceAfter: number
  description: string
  createdAt: string
}

export function MobileWalletPage() {
  const { tokenBalance, refresh: refreshTokens } = useTokens()
  const { user } = useAuth()
  const { error: showError, success: showSuccess } = useToast()
  const navigate = useNavigate()
  const [packages, setPackages] = useState<TokenPackage[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const isEmployee = !!user?.organizationId && user?.role !== 'org_owner' && user?.role !== 'platform_admin'
  const canBuy = !isEmployee

  const popularPackage = useMemo(() => packages.find(p => p.popular) || packages[0], [packages])
  const usedThisList = useMemo(() => transactions.filter(tx => tx.tokens < 0).reduce((sum, tx) => sum + Math.abs(tx.tokens), 0), [transactions])
  const addedThisList = useMemo(() => transactions.filter(tx => tx.tokens > 0).reduce((sum, tx) => sum + tx.tokens, 0), [transactions])

  const loadData = useCallback(async () => {
    try {
      const [pkgRes, txRes] = await Promise.all([
        api.get('/token-wallet/packages'),
        api.get('/token-wallet/history?limit=20'),
      ])
      setPackages(pkgRes.data?.data || [])
      setTransactions(txRes.data?.data?.transactions || [])
    } catch {
      showError('Failed to load wallet data. Pull down to retry.')
    } finally {
      setIsLoading(false)
    }
  }, [showError])

  useEffect(() => { loadData() }, [loadData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([loadData(), refreshTokens()])
    setIsRefreshing(false)
    showSuccess('Wallet refreshed')
  }

  const handleBuy = async (pkg: TokenPackage | undefined) => {
    if (!pkg) { showError('No packages available'); return }
    try {
      const res = await api.post('/stripe/purchase-tokens', { packageId: pkg.id })
      if (res.data?.data?.checkoutUrl) {
        window.open(res.data.data.checkoutUrl, '_system')
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined
      showError(message || 'Purchase failed')
    }
  }

  if (isLoading) {
    return (
      <div className="mobile-page" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="mobile-card" style={{ height: i === 1 ? 190 : 92, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="mobile-page" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div>
          <p style={{ margin: 0, color: 'var(--color-primary)', fontSize: 14, fontWeight: 900 }}>Balance and billing</p>
          <h1 style={{ margin: '4px 0 0', color: 'var(--color-text-primary)', fontSize: 32, lineHeight: 1.03, fontWeight: 900, letterSpacing: 0 }}>
            Wallet
          </h1>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing}
          style={{ width: 42, height: 42, borderRadius: 15, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 24px rgba(26,26,46,0.05)' }}
          aria-label="Refresh wallet">
          <RefreshCw size={18} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </header>

      <section style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0F172A 0%, var(--color-primary-hover) 45%, var(--color-primary) 100%)',
        borderRadius: 28,
        padding: 22,
        color: 'white',
        boxShadow: '0 18px 46px var(--color-primary-glow)',
      }}>
        <div style={{ position: 'absolute', right: -46, top: -48, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.10)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 900, opacity: 0.72, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                Available tokens
              </p>
              <p style={{ margin: '10px 0 0', fontSize: 45, lineHeight: 0.95, fontWeight: 900, letterSpacing: 0 }}>
                <AnimatedNumber value={tokenBalance} format={formatTokens} />
              </p>
            </div>
            <div style={{ width: 50, height: 50, borderRadius: 18, background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={24} />
            </div>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 13, opacity: 0.75, fontWeight: 650 }}>
            {user?.organizationId ? 'Organization wallet' : 'Personal plan'} · secure checkout
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            {canBuy && (
              <button onClick={() => handleBuy(popularPackage)} style={primaryHeroButton}>
                <CreditCard size={16} />
                Buy tokens
              </button>
            )}
            <button onClick={() => navigate('/usage')} style={secondaryHeroButton(canBuy)}>
              <BarChart3 size={16} />
              Usage
            </button>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <WalletMetric label="Added" value={formatTokens(addedThisList)} icon={<ArrowDownRight size={15} />} color="#10B981" />
        <WalletMetric label="Used" value={formatTokens(usedThisList)} icon={<ArrowUpRight size={15} />} color="var(--color-primary)" />
        <WalletMetric label="Status" value={canBuy ? 'Ready' : 'Managed'} icon={<ShieldCheck size={15} />} color="#2563EB" />
      </div>

      {canBuy && (
        <section>
          <h2 className="mobile-section-title">Token packages</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {packages.slice(0, 6).map(pkg => (
              <PackageCard key={pkg.id} pkg={pkg} onClick={() => handleBuy(pkg)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 className="mobile-section-title" style={{ margin: 0 }}>Transactions</h2>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 800 }}>{transactions.length} total</span>
        </div>
        {transactions.length === 0 ? (
          <div className="mobile-card" style={{ padding: '34px 20px', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 18, background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Sparkles size={22} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--color-text-primary)', margin: 0 }}>No transactions yet</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>Activity appears here after buying tokens or chatting.</p>
          </div>
        ) : (
          <div className="mobile-card" style={{ overflow: 'hidden' }}>
            {transactions.map((tx, index) => (
              <TransactionRow key={tx.id} tx={tx} last={index === transactions.length - 1} />
            ))}
          </div>
        )}
      </section>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
    </div>
  )
}

const primaryHeroButton = {
  flex: 1,
  minHeight: 46,
  borderRadius: 16,
  border: 'none',
  background: 'white',
  color: 'var(--color-primary)',
  fontSize: 14,
  fontWeight: 900,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}

function secondaryHeroButton(split: boolean) {
  return {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    border: split ? '1px solid rgba(255,255,255,0.25)' : 'none',
    background: split ? 'rgba(255,255,255,0.15)' : 'white',
    color: split ? 'white' : 'var(--color-primary)',
    fontSize: 14,
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.0+$/, '')}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return n.toLocaleString()
}

function WalletMetric({ icon, label, value, color }: { icon: ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="mobile-card" style={{ padding: '12px 10px' }}>
      <div style={{ width: 28, height: 28, borderRadius: 10, background: `${color}13`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        {icon}
      </div>
      <p style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 15, lineHeight: 1.1, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 10, fontWeight: 800 }}>{label}</p>
    </div>
  )
}

function PackageCard({ pkg, onClick }: { pkg: TokenPackage; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      position: 'relative',
      minHeight: 132,
      padding: '16px 9px 13px',
      borderRadius: 20,
      background: pkg.popular ? 'linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))' : 'var(--color-surface)',
      boxShadow: pkg.popular ? '0 16px 34px var(--color-primary-glow)' : 'none',
      border: pkg.popular ? 'none' : '1px solid var(--color-border)',
      textAlign: 'center',
      color: pkg.popular ? 'white' : 'var(--color-text-primary)',
    }}>
      {pkg.popular && (
        <span style={{
          position: 'absolute',
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 9,
          fontWeight: 900,
          textTransform: 'uppercase',
          padding: '4px 8px',
          borderRadius: 999,
          background: '#10B981',
          color: 'white',
          whiteSpace: 'nowrap',
        }}>
          Best
        </span>
      )}
      <p style={{ fontSize: 19, fontWeight: 900, margin: '0 0 2px', letterSpacing: 0 }}>{formatTokens(pkg.tokens)}</p>
      <p style={{ fontSize: 10, color: pkg.popular ? 'rgba(255,255,255,0.74)' : 'var(--color-text-muted)', margin: '0 0 11px', fontWeight: 750 }}>tokens</p>
      <p style={{ fontSize: 23, fontWeight: 900, color: pkg.popular ? 'white' : 'var(--color-primary)', margin: 0 }}>${pkg.price}</p>
      {pkg.savings && (
        <p style={{ fontSize: 10, color: pkg.popular ? 'rgba(255,255,255,0.82)' : '#10B981', fontWeight: 900, margin: '4px 0 0' }}>
          {pkg.savings}
        </p>
      )}
    </button>
  )
}

function TransactionRow({ tx, last }: { tx: Transaction; last: boolean }) {
  const positive = tx.type === 'purchase' || tx.tokens > 0
  const color = positive ? '#10B981' : 'var(--color-primary)'
  const Icon = positive ? ArrowDownRight : ArrowUpRight

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 15px',
      borderBottom: last ? 'none' : '1px solid var(--color-border)',
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}13`, color, flexShrink: 0 }}>
        <Icon size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 850, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tx.description}
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '3px 0 0', fontWeight: 650 }}>
          {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {' · '}
          {labelTransaction(tx.type)}
        </p>
      </div>
      <span style={{ fontSize: 14, fontWeight: 900, fontFamily: 'monospace', color }}>
        {tx.tokens > 0 ? '+' : ''}{formatTokens(Math.abs(tx.tokens))}
      </span>
    </div>
  )
}

function labelTransaction(type: string) {
  if (type === 'purchase') return 'Purchase'
  if (type === 'usage') return 'Usage'
  if (type === 'allocation_received') return 'Received'
  if (type === 'allocation_given') return 'Sent'
  return type
}

function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
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

  return <>{format ? format(display) : display.toLocaleString()}</>
}

export default MobileWalletPage
