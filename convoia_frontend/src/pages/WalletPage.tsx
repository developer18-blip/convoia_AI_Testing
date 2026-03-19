import { useEffect, useState } from 'react'
import { Wallet, ArrowUpCircle, ArrowDownCircle, TrendingUp } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../hooks/useToast'
import { Card } from '../components/ui/Card'
import { StatCard } from '../components/shared/StatCard'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Tabs } from '../components/ui/Tabs'
import { Pagination } from '../components/ui/Pagination'
import { LoadingPage } from '../components/shared/LoadingPage'
import { EmptyState } from '../components/shared/EmptyState'
import { formatCurrency, formatDateTime } from '../lib/utils'
import api from '../lib/api'
import type { WalletTransaction } from '../types'

export function WalletPage() {
  const { wallet, isLoading: walletLoading, setShowTopUp } = useWallet()
  const toast = useToast()
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })
  const [filter, setFilter] = useState('all')
  const [isLoading, setIsLoading] = useState(true)

  const fetchTransactions = async (page = 1) => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (filter !== 'all') params.set('type', filter)
      const res = await api.get(`/wallet/transactions?${params}`)
      const data = res.data.data
      if (data.data) {
        setTransactions(data.data)
        setPagination(data.pagination)
      } else if (Array.isArray(data)) {
        setTransactions(data)
      }
    } catch {
      toast.error('Failed to load transactions')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchTransactions() }, [filter])

  if (walletLoading && !wallet) return <LoadingPage />

  const dailyAvg = wallet && wallet.totalSpent > 0 ? wallet.totalSpent / 30 : 0
  const daysRemaining = dailyAvg > 0 && wallet ? Math.floor(wallet.balance / dailyAvg) : null

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card padding="lg" className="bg-gradient-to-r from-primary/10 to-indigo-600/10 border-primary/20">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-text-muted mb-1">Available Balance</p>
            <p className="text-4xl font-semibold font-mono text-text-primary">
              {wallet ? formatCurrency(wallet.balance) : '$0.00'}
            </p>
            {daysRemaining !== null && (
              <p className="text-sm text-text-muted mt-2">
                At current pace: ~{daysRemaining} days remaining
              </p>
            )}
          </div>
          <Button size="lg" onClick={() => setShowTopUp(true)}>
            <ArrowUpCircle size={18} />
            Top Up
          </Button>
        </div>
      </Card>

      {/* Smart insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="md">
          <div className="flex items-center gap-2 text-text-muted mb-1">
            <TrendingUp size={14} />
            <span className="text-xs">Daily Average</span>
          </div>
          <p className="text-lg font-semibold font-mono text-text-primary">{formatCurrency(dailyAvg)}</p>
        </Card>
        <StatCard title="Total Topped Up" value={wallet ? formatCurrency(wallet.totalToppedUp) : '$0.00'} />
        <StatCard title="Total Spent" value={wallet ? formatCurrency(wallet.totalSpent) : '$0.00'} />
      </div>

      {/* Transactions */}
      <Card padding="none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Transaction History</h3>
          <Tabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'credit', label: 'Credits' },
              { id: 'debit', label: 'Debits' },
            ]}
            activeTab={filter}
            onChange={setFilter}
          />
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-text-muted text-sm animate-pulse">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <EmptyState icon={<Wallet size={40} />} title="No transactions" description="Your transaction history will appear here." />
        ) : (
          <>
            <div className="divide-y divide-border/50">
              {transactions.map((tx) => (
                <div key={tx.id} className="px-5 py-3 flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${tx.type === 'credit' ? 'bg-success/10' : 'bg-danger/10'}`}>
                    {tx.type === 'credit' ? (
                      <ArrowUpCircle size={18} className="text-success" />
                    ) : (
                      <ArrowDownCircle size={18} className="text-danger" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary">{tx.description}</p>
                    <p className="text-xs text-text-muted">{formatDateTime(tx.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-mono font-medium ${tx.type === 'credit' ? 'text-success' : 'text-danger'}`}>
                      {tx.type === 'credit' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                    </p>
                    <Badge size="sm" variant={tx.type === 'credit' ? 'success' : 'danger'}>
                      {tx.type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} onPageChange={(p) => fetchTransactions(p)} />
          </>
        )}
      </Card>
    </div>
  )
}

export default WalletPage;
