import { useState, useEffect, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, BarChart3, RefreshCw, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { useTokens } from '../../contexts/TokenContext'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { useToast } from '../../hooks/useToast'

interface Transaction {
  id: string; type: string; tokens: number; balanceAfter: number; description: string; createdAt: string
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.0+$/, '')}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return n.toLocaleString()
}

export function MobileWalletPage() {
  const { tokenBalance, refresh: refreshTokens } = useTokens()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const isEmployee = !!user?.organizationId && user?.role !== 'org_owner' && user?.role !== 'platform_admin'
  const canBuy = !isEmployee

  const usedThisList = transactions.filter(tx => tx.tokens < 0).reduce((s, tx) => s + Math.abs(tx.tokens), 0)
  const addedThisList = transactions.filter(tx => tx.tokens > 0).reduce((s, tx) => s + tx.tokens, 0)

  const loadData = async () => {
    try {
      const txRes = await api.get('/token-wallet/history?limit=20')
      setTransactions(txRes.data?.data?.transactions || [])
    } catch {
      toast.error('Failed to load wallet data. Pull down to retry.')
    } finally { setIsLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([loadData(), refreshTokens()])
    setIsRefreshing(false)
    toast.success('Wallet refreshed')
  }

  if (isLoading) {
    return (
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="mobile-card" style={{ height: i === 1 ? 190 : 92, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div>
          <p style={{ margin: 0, color: 'var(--color-primary)', fontSize: 14, fontWeight: 900 }}>Balance and billing</p>
          <h1 style={{ margin: '4px 0 0', color: 'var(--color-text-primary)', fontSize: 32, lineHeight: 1.03, fontWeight: 900 }}>Wallet</h1>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing}
          style={{ width: 42, height: 42, borderRadius: 15, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 24px rgba(26,26,46,0.05)' }}
          aria-label="Refresh wallet">
          <RefreshCw size={18} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </header>

      {/* ── Premium hero — brand/provider accent gradient ── */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
        borderRadius: 28, padding: 22, color: 'white',
        boxShadow: '0 18px 46px var(--color-primary-glow)',
      }}>
        <div style={{ position: 'absolute', right: -46, top: -48, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 900, opacity: 0.78, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Available tokens</p>
              <p style={{ margin: '10px 0 0', fontSize: 45, lineHeight: 0.95, fontWeight: 900 }}>{formatTokens(tokenBalance)}</p>
            </div>
            <div style={{ width: 50, height: 50, borderRadius: 18, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
              <Wallet size={24} />
            </div>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 13, opacity: 0.82, fontWeight: 650 }}>
            {user?.organizationId ? 'Organization wallet' : 'Personal plan'}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => navigate('/usage')} style={heroBtn(false)}>
              <BarChart3 size={16} /> View usage
            </button>
          </div>
        </div>
      </section>

      {/* ── Metric pills ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <WalletMetric label="Added" value={formatTokens(addedThisList)} icon={<ArrowDownRight size={15} />} color="#10B981" bg="rgba(16,185,129,0.12)" />
        <WalletMetric label="Used" value={formatTokens(usedThisList)} icon={<ArrowUpRight size={15} />} color="var(--color-primary)" bg="var(--color-primary-light)" />
        <WalletMetric label="Status" value={canBuy ? 'Ready' : 'Managed'} icon={<ShieldCheck size={15} />} color="var(--color-primary)" bg="var(--color-primary-light)" />
      </div>

      {/* ── Transactions ── */}
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
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>Activity appears here as you chat.</p>
          </div>
        ) : (
          <div className="mobile-card" style={{ overflow: 'hidden', padding: 0 }}>
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

function heroBtn(split: boolean): React.CSSProperties {
  return {
    flex: 1, minHeight: 46, borderRadius: 16,
    border: split ? '1px solid rgba(255,255,255,0.28)' : 'none',
    background: split ? 'rgba(255,255,255,0.16)' : 'white',
    color: split ? 'white' : 'var(--color-primary)',
    fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    cursor: 'pointer',
  }
}

function WalletMetric({ icon, label, value, color, bg }: { icon: ReactNode; label: string; value: string; color: string; bg: string }) {
  return (
    <div className="mobile-card" style={{ padding: '12px 10px' }}>
      <div style={{ width: 28, height: 28, borderRadius: 10, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        {icon}
      </div>
      <p style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 15, lineHeight: 1.1, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 10, fontWeight: 800 }}>{label}</p>
    </div>
  )
}

function TransactionRow({ tx, last }: { tx: Transaction; last: boolean }) {
  const positive = tx.type === 'purchase' || tx.tokens > 0
  const color = positive ? '#10B981' : 'var(--color-primary)'
  const bg = positive ? 'rgba(16,185,129,0.12)' : 'var(--color-primary-light)'
  const Icon = positive ? ArrowDownRight : ArrowUpRight
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 15px', borderBottom: last ? 'none' : '1px solid var(--color-border)' }}>
      <div style={{ width: 40, height: 40, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, color, flexShrink: 0 }}>
        <Icon size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 850, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</p>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '3px 0 0', fontWeight: 650 }}>
          {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {labelTransaction(tx.type)}
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

export default MobileWalletPage
