import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Receipt, ShoppingCart, Zap, ArrowDownLeft, ArrowUpRight, Sliders, Wallet, TrendingUp, TrendingDown } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Pagination } from '../components/ui/Pagination'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/shared/EmptyState'
import { useAuth } from '../hooks/useAuth'
import { useTokens } from '../contexts/TokenContext'
import { formatDateTime, formatTokens } from '../lib/utils'
import api from '../lib/api'

type TxType = 'purchase' | 'usage' | 'allocation_received' | 'allocation_given' | 'adjustment'

interface Transaction {
  id: string
  type: TxType
  tokens: number          // signed: + added, - deducted
  balanceAfter: number
  description: string
  reference: string | null
  createdAt: string
}

interface PaginationState {
  page: number
  limit: number
  total: number
  pages: number
}

type FilterTab = 'all' | 'purchase' | 'usage' | 'allocation'

const TAB_LABEL: Record<FilterTab, string> = {
  all: 'All',
  purchase: 'Purchases',
  usage: 'Usage',
  allocation: 'Allocations',
}

// Visual mapping for transaction rows. Color/icon depend on type, except
// `adjustment` whose delta color is sign-based (positive=green, negative=red)
// per product Decision B.
function rowVisual(type: TxType, tokens: number) {
  switch (type) {
    case 'purchase':
      return { Icon: ShoppingCart, deltaColor: 'var(--color-success, #10B981)' }
    case 'usage':
      return { Icon: Zap, deltaColor: 'var(--text-muted)' }
    case 'allocation_received':
      return { Icon: ArrowDownLeft, deltaColor: 'var(--color-success, #10B981)' }
    case 'allocation_given':
      return { Icon: ArrowUpRight, deltaColor: 'var(--color-warning, #F59E0B)' }
    case 'adjustment':
      return {
        Icon: Sliders,
        deltaColor: tokens >= 0 ? 'var(--color-success, #10B981)' : 'var(--color-danger, #EF4444)',
      }
  }
}

function rowFooterExtra(type: TxType): string | null {
  if (type === 'purchase') return 'Receipt emailed'
  if (type === 'adjustment') return 'Manual adjustment'
  return null
}

export function TransactionsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { tokenBalance, totalPurchased, totalUsed } = useTokens()

  const [filter, setFilter] = useState<FilterTab>('all')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Allocations tab visibility — single cheap probe on mount. We DON'T re-probe
  // when the user filters, because the answer can't change within a session.
  const [hasAllocations, setHasAllocations] = useState(false)
  useEffect(() => {
    let cancelled = false
    api.get('/token-wallet/history', { params: { type: 'allocation', limit: 1 } })
      .then((res) => {
        if (cancelled) return
        setHasAllocations((res.data?.data?.pagination?.total || 0) > 0)
      })
      .catch(() => { /* silent — tab just stays hidden */ })
    return () => { cancelled = true }
  }, [])

  // Reset to page 1 whenever filter changes — different filter = different result set.
  useEffect(() => {
    setPagination((p) => ({ ...p, page: 1 }))
  }, [filter])

  // Fetch on filter or page change.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params: Record<string, string | number> = { page: pagination.page, limit: pagination.limit }
    if (filter !== 'all') params.type = filter
    api.get('/token-wallet/history', { params })
      .then((res) => {
        if (cancelled) return
        const data = res.data?.data
        setTransactions(Array.isArray(data?.transactions) ? data.transactions : [])
        if (data?.pagination) setPagination((p) => ({ ...p, ...data.pagination }))
      })
      .catch(() => {
        if (cancelled) return
        setError('Failed to load transactions')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, pagination.page])

  const isOrgOwner = user?.role === 'org_owner'
  const isIndividual = !user?.organizationId || user?.role === 'user'

  const subtitle = useMemo(() => {
    if (isOrgOwner) {
      return 'Your personal token activity. For organization pool transactions, see Billing.'
    }
    return 'Your token purchases, usage, and allocations.'
  }, [isOrgOwner])

  const visibleTabs: FilterTab[] = useMemo(() => {
    const tabs: FilterTab[] = ['all', 'purchase', 'usage']
    if (hasAllocations) tabs.push('allocation')
    return tabs
  }, [hasAllocations])

  return (
    <div className="space-y-5 max-w-4xl w-full mx-auto">
      <header>
        <h2 className="text-xl sm:text-2xl font-semibold text-text-primary flex items-center gap-2">
          <Receipt size={22} /> Transactions
        </h2>
        <p className="text-sm text-text-muted mt-1">{subtitle}</p>
      </header>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <SummaryTile
          icon={<Wallet size={16} />}
          label="Current Balance"
          value={formatTokens(tokenBalance)}
          accent
        />
        <SummaryTile
          icon={<TrendingUp size={16} />}
          label="Lifetime Purchased"
          value={formatTokens(totalPurchased)}
        />
        <SummaryTile
          icon={<TrendingDown size={16} />}
          label="Lifetime Used"
          value={formatTokens(totalUsed)}
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {visibleTabs.map((t) => {
          const active = filter === t
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
              style={active
                ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }
                : { background: 'var(--surface-2)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
            >
              {TAB_LABEL[t]}
            </button>
          )
        })}
      </div>

      {/* List */}
      <Card padding="none">
        {loading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-2 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-2 rounded w-2/3 animate-pulse" />
                  <div className="h-3 bg-surface-2 rounded w-1/3 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-surface-2 rounded w-16 animate-pulse" />
                  <div className="h-3 bg-surface-2 rounded w-20 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-sm text-text-secondary mb-4">{error}</p>
            <Button onClick={() => setPagination((p) => ({ ...p }))} variant="secondary" size="sm">
              Retry
            </Button>
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={<Receipt size={40} />}
            title={filter === 'all' ? 'No transactions yet' : `No ${TAB_LABEL[filter].toLowerCase()} found`}
            description={
              filter === 'all'
                ? (isIndividual
                    ? 'Buy tokens or start a chat to see your activity here.'
                    : 'Your token activity will appear here once you start using the platform.')
                : 'Try a different filter or check back after more activity.'
            }
            action={
              filter !== 'all'
                ? { label: 'Show all', onClick: () => setFilter('all') }
                : isIndividual
                  ? { label: 'Buy tokens', onClick: () => navigate('/tokens/buy') }
                  : { label: 'Go to chat', onClick: () => navigate('/chat') }
            }
          />
        ) : (
          <>
            <div className="divide-y divide-border/50">
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
            {pagination.pages > 1 && (
              <Pagination
                page={pagination.page}
                pages={pagination.pages}
                total={pagination.total}
                onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
              />
            )}
          </>
        )}
      </Card>
    </div>
  )
}

interface SummaryTileProps {
  icon: React.ReactNode
  label: string
  value: string
  accent?: boolean
}

function SummaryTile({ icon, label, value, accent }: SummaryTileProps) {
  return (
    <Card padding="md">
      <div
        className="flex items-center gap-2 text-text-muted mb-1.5"
        style={accent ? { color: 'var(--accent)' } : undefined}
      >
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl sm:text-2xl font-semibold text-text-primary font-mono">{value}</div>
    </Card>
  )
}

interface TransactionRowProps {
  tx: Transaction
}

function TransactionRow({ tx }: TransactionRowProps) {
  const { Icon, deltaColor } = rowVisual(tx.type, tx.tokens)
  const footerExtra = rowFooterExtra(tx.type)
  // Use absolute formatter then prepend sign — formatTokens(-2400) returns
  // "-2.4K" which renders unevenly with positives that need an explicit "+".
  const sign = tx.tokens >= 0 ? '+' : ''
  const deltaLabel = `${sign}${formatTokens(tx.tokens)}`

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
      >
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{tx.description}</p>
        <p className="text-xs text-text-muted truncate">
          {formatDateTime(tx.createdAt)}
          {footerExtra && <span> · {footerExtra}</span>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-mono font-medium" style={{ color: deltaColor }}>
          {deltaLabel}
        </p>
        <p className="hidden sm:block text-xs text-text-muted font-mono">
          Bal: {formatTokens(tx.balanceAfter)}
        </p>
      </div>
    </div>
  )
}

export default TransactionsPage
