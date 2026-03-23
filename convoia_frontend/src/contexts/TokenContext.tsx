import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'

interface TokenContextType {
  tokenBalance: number
  formattedBalance: string
  totalPurchased: number
  totalUsed: number
  allocatedTokens: number
  isLoading: boolean
  refresh: () => Promise<void>
  hasEnoughTokens: (needed: number) => boolean
}

const TokenContext = createContext<TokenContextType | null>(null)

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return count.toLocaleString()
}

export function TokenProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [tokenBalance, setTokenBalance] = useState(0)
  const [totalPurchased, setTotalPurchased] = useState(0)
  const [totalUsed, setTotalUsed] = useState(0)
  const [allocatedTokens, setAllocatedTokens] = useState(0)
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

  return (
    <TokenContext.Provider value={{
      tokenBalance,
      formattedBalance: formatTokens(tokenBalance),
      totalPurchased,
      totalUsed,
      allocatedTokens,
      isLoading,
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
