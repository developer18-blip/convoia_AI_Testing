import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'
import { computeTokenThresholds, tokenLevelForBalance, type TokenLevel, type TokenThresholds } from '../lib/tokenThresholds'

interface TokenContextType {
  tokenBalance: number
  formattedBalance: string
  totalPurchased: number
  totalUsed: number
  allocatedTokens: number
  largestPurchaseLast90Days: number | null
  thresholds: TokenThresholds
  tokenLevel: TokenLevel
  isLoading: boolean
  hasTokens: boolean           // true if tokenBalance > 0
  refresh: () => Promise<void>
  hasEnoughTokens: (needed: number) => boolean
}

const TokenContext = createContext<TokenContextType | null>(null)

function formatTokens(count: number | null | undefined): string {
  const n = Number(count) || 0
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString()
}

export function TokenProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [tokenBalance, setTokenBalance] = useState(0)
  const [totalPurchased, setTotalPurchased] = useState(0)
  const [totalUsed, setTotalUsed] = useState(0)
  const [allocatedTokens, setAllocatedTokens] = useState(0)
  const [largestPurchaseLast90Days, setLargestPurchaseLast90Days] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await api.get('/token-wallet/balance')
      const data = res.data.data
      setTokenBalance(data.tokenBalance || 0)
      setTotalPurchased(data.totalPurchased || 0)
      setTotalUsed(data.totalUsed || 0)
      setAllocatedTokens(data.allocatedTokens || 0)
      setLargestPurchaseLast90Days(
        typeof data.largestPurchaseLast90Days === 'number' ? data.largestPurchaseLast90Days : null,
      )
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) refresh()
    else {
      setTokenBalance(0)
      setTotalPurchased(0)
      setTotalUsed(0)
      setAllocatedTokens(0)
      setLargestPurchaseLast90Days(null)
      setIsLoading(false)
    }
  }, [isAuthenticated, refresh])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isAuthenticated) return
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  }, [isAuthenticated, refresh])

  // Listen for custom refresh events
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('tokens:refresh', handler)
    return () => window.removeEventListener('tokens:refresh', handler)
  }, [refresh])

  const hasEnoughTokens = useCallback((needed: number) => tokenBalance >= needed, [tokenBalance])

  const thresholds = useMemo(
    () => computeTokenThresholds(largestPurchaseLast90Days),
    [largestPurchaseLast90Days],
  )
  const tokenLevel = useMemo(
    () => tokenLevelForBalance(tokenBalance, thresholds),
    [tokenBalance, thresholds],
  )

  return (
    <TokenContext.Provider value={{
      tokenBalance,
      formattedBalance: formatTokens(tokenBalance),
      totalPurchased,
      totalUsed,
      allocatedTokens,
      largestPurchaseLast90Days,
      thresholds,
      tokenLevel,
      isLoading,
      hasTokens: tokenBalance > 0,
      refresh,
      hasEnoughTokens,
    }}>
      {children}
    </TokenContext.Provider>
  )
}

export function useTokens() {
  const ctx = useContext(TokenContext)
  if (!ctx) throw new Error('useTokens must be used within TokenProvider')
  return ctx
}
