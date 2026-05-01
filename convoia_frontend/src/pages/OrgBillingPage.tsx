import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Zap, ShoppingCart, History, Users, AlertTriangle, Check } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useToast } from '../hooks/useToast'
import api from '../lib/api'
import { formatDate } from '../lib/utils'

interface TokenPackage {
  id: string
  tokens: number
  price: number
  label: string
  pricePerMillion: number
}

interface PoolData {
  totalTokens: number
  allocatedTokens: number
  usedTokens: number
  availableTokens: number
}

interface Purchase {
  id: string
  amount: number
  tokensReceived: number
  pricePerMillionTokens: number
  status: string
  createdAt: string
}

interface Allocation {
  id: string
  assignedTo: { id: string; name: string; email: string; role: string }
  assignedBy: { id: string; name: string }
  tokensAllocated: number
  tokensUsed: number
  tokensRemaining: number
  status: string
  createdAt: string
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function OrgBillingPage() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [packages, setPackages] = useState<TokenPackage[]>([])
  const [pool, setPool] = useState<PoolData>({ totalTokens: 0, allocatedTokens: 0, usedTokens: 0, availableTokens: 0 })
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [buyingId, setBuyingId] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const [pkgRes, poolRes] = await Promise.all([
        api.get('/stripe/token-packages'),
        api.get('/stripe/token-pool'),
      ])
      setPackages(pkgRes.data.data?.packages || [])
      const poolData = poolRes.data.data
      setPool(poolData?.pool || { totalTokens: 0, allocatedTokens: 0, usedTokens: 0, availableTokens: 0 })
      setPurchases(poolData?.purchases || [])
      setAllocations(poolData?.allocations || [])
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      const tokens = searchParams.get('tokens')
      toast.success(`${tokens ? fmtTokens(parseInt(tokens)) : ''} tokens purchased successfully!`)
      fetchData()
      setSearchParams({}, { replace: true })
    }
    if (searchParams.get('cancelled') === 'true') {
      toast.info('Token purchase was cancelled.')
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

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
        <h2 className="text-2xl font-semibold text-text-primary">Token Store</h2>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary">Token Store</h2>

      {/* Token Pool Overview */}
      <Card padding="lg" className="bg-gradient-to-r from-primary/10 to-indigo-600/10 border-primary/20">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={20} className="text-primary" />
          <h3 className="text-lg font-semibold text-text-primary">Organization Token Pool</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-text-muted">Total Tokens</p>
            <p className="text-2xl font-bold text-text-primary font-mono">{fmtTokens(pool.totalTokens)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Allocated</p>
            <p className="text-2xl font-bold text-amber-400 font-mono">{fmtTokens(pool.allocatedTokens)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Used</p>
            <p className="text-2xl font-bold text-red-400 font-mono">{fmtTokens(pool.usedTokens)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Available</p>
            <p className="text-2xl font-bold text-emerald-400 font-mono">{fmtTokens(pool.availableTokens)}</p>
          </div>
        </div>

        {pool.totalTokens > 0 && (
          <ProgressBar value={pool.usedTokens} max={pool.totalTokens} size="sm" />
        )}
      </Card>

      {/* Low token warning */}
      {pool.totalTokens > 0 && pool.availableTokens < pool.totalTokens * 0.1 && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            Your available token pool is running low ({fmtTokens(pool.availableTokens)} remaining). Purchase more tokens below.
          </p>
        </div>
      )}

      {/* Buy Tokens */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={18} className="text-primary" />
          <h3 className="text-lg font-semibold text-text-primary">Buy Tokens</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-2xl overflow-hidden"
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              <div className="p-5 text-center">
                <p className="text-3xl font-bold font-mono" style={{ color: '#7C3AED' }}>
                  {pkg.label}
                </p>
                <p className="text-xs text-text-muted mt-1">tokens</p>

                <p className="text-text-primary mt-4">
                  <span className="text-2xl font-bold">${pkg.price}</span>
                </p>
                <p className="text-xs text-text-muted">${pkg.pricePerMillion}/1M tokens</p>

                <Button
                  className="w-full mt-4"
                  onClick={() => handleBuy(pkg.id)}
                  isLoading={buyingId === pkg.id}
                >
                  <Check size={14} /> Buy {pkg.label}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Allocation Breakdown */}
      {allocations.length > 0 && (
        <Card padding="none">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-text-primary">Token Allocations</h3>
          </div>
          <div className="divide-y divide-border/50">
            {allocations.map((a) => (
              <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">{a.assignedTo.name}</p>
                  <p className="text-xs text-text-muted">{a.assignedTo.role.replace('_', ' ')} &middot; by {a.assignedBy.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-text-primary">
                    {fmtTokens(a.tokensUsed)} / {fmtTokens(a.tokensAllocated)}
                  </p>
                  <p className="text-xs text-text-muted">
                    {fmtTokens(a.tokensRemaining)} remaining
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Purchase History */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <History size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-text-primary">Purchase History</h3>
        </div>
        {purchases.length === 0 ? (
          <div className="px-5 py-8 text-center text-text-muted text-sm">
            No purchases yet. Buy tokens above to get started.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {purchases.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    +{fmtTokens(p.tokensReceived)} tokens
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatDate(p.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-text-primary">${(Number(p.amount) || 0).toFixed(2)}</p>
                  <p className="text-xs text-text-muted">${p.pricePerMillionTokens}/M</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default OrgBillingPage
