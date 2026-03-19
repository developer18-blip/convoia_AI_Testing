import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import api from '../lib/api'
import type { Wallet } from '../types'

interface WalletContextType {
  wallet: Wallet | null
  isLoading: boolean
  showTopUp: boolean
  setShowTopUp: (show: boolean) => void
  refreshWallet: () => Promise<void>
}

export const WalletContext = createContext<WalletContextType>({
  wallet: null,
  isLoading: false,
  showTopUp: false,
  setShowTopUp: () => {},
  refreshWallet: async () => {},
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showTopUp, setShowTopUp] = useState(false)

  const refreshWallet = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await api.get('/wallet/summary')
      const data = res.data?.data
      setWallet(data ? { ...data, balance: data.balance ?? 0, totalSpent: data.totalSpent ?? 0, totalToppedUp: data.totalToppedUp ?? 0 } : null)
    } catch {
      // Silently fail — wallet display is non-critical
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('convoia_token')
    if (token) refreshWallet()
  }, [refreshWallet])

  useEffect(() => {
    const handler = () => setShowTopUp(true)
    window.addEventListener('wallet:insufficient', handler)
    return () => window.removeEventListener('wallet:insufficient', handler)
  }, [])

  // Listen for wallet:refresh events (dispatched after file uploads, image generation, etc.)
  useEffect(() => {
    const handler = () => refreshWallet()
    window.addEventListener('wallet:refresh', handler)
    return () => window.removeEventListener('wallet:refresh', handler)
  }, [refreshWallet])

  return (
    <WalletContext.Provider value={{ wallet, isLoading, showTopUp, setShowTopUp, refreshWallet }}>
      {children}
    </WalletContext.Provider>
  )
}
