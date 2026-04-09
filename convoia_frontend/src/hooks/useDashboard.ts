import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'
import { useAuth } from './useAuth'
import { generateInsights } from '../lib/insights'
import type { DashboardStats, Wallet, HourlySession, UsageLog, InsightData, Budget } from '../types'

const defaultStats: DashboardStats = {
  today: { queries: 0, cost: 0, tokens: 0 },
  thisWeek: { queries: 0, cost: 0, tokens: 0 },
  thisMonth: { queries: 0, cost: 0, tokens: 0 },
  lastMonth: { queries: 0, cost: 0, tokens: 0 },
  allTime: { queries: 0, cost: 0 },
  topModels: [],
  dailyUsage: [],
  providerBreakdown: [],
}

const defaultWallet: Wallet = {
  userId: '',
  balance: 0,
  totalToppedUp: 0,
  totalSpent: 0,
  currency: 'USD',
}

function safePeriod(data: unknown): { queries: number; cost: number; tokens: number } {
  if (!data || typeof data !== 'object') return { queries: 0, cost: 0, tokens: 0 }
  const d = data as Record<string, unknown>
  return {
    queries: Number(d.queries ?? 0) || 0,
    cost: Number(d.cost ?? 0) || 0,
    tokens: Number(d.tokens ?? 0) || 0,
  }
}

export function useDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats>(defaultStats)
  const [wallet, setWallet] = useState<Wallet>(defaultWallet)
  const [sessions, setSessions] = useState<HourlySession[]>([])
  const [recentUsage, setRecentUsage] = useState<UsageLog[]>([])
  const [insights, setInsights] = useState<InsightData[]>([])
  const [budget, setBudget] = useState<Budget | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    if (!user) return
    try {
      setIsLoading(true)
      setError(null)

      const results = await Promise.allSettled([
        api.get('/usage/dashboard'),
        api.get('/wallet/summary'),
        api.get('/session/active'),
        api.get('/usage/my?limit=10'),
        api.get('/budget/status'),
      ])

      // Stats — normalize every field defensively
      const statsRaw = results[0].status === 'fulfilled' ? results[0].value.data?.data : null
      const normalizedStats: DashboardStats = {
        today: safePeriod(statsRaw?.today),
        thisWeek: safePeriod(statsRaw?.thisWeek),
        thisMonth: safePeriod(statsRaw?.thisMonth),
        lastMonth: safePeriod(statsRaw?.lastMonth),
        allTime: { queries: Number(statsRaw?.allTime?.queries) || 0, cost: Number(statsRaw?.allTime?.cost) || 0 },
        topModels: Array.isArray(statsRaw?.topModels) ? statsRaw.topModels : [],
        dailyUsage: Array.isArray(statsRaw?.dailyUsage) ? statsRaw.dailyUsage : [],
        providerBreakdown: Array.isArray(statsRaw?.providerBreakdown) ? statsRaw.providerBreakdown : [],
      }
      setStats(normalizedStats)

      // Wallet
      const walletRaw = results[1].status === 'fulfilled' ? results[1].value.data?.data : null
      const normalizedWallet: Wallet = {
        userId: walletRaw?.userId ?? user.id ?? '',
        balance: Number(walletRaw?.balance ?? 0) || 0,
        totalToppedUp: Number(walletRaw?.totalToppedUp ?? 0) || 0,
        totalSpent: Number(walletRaw?.totalSpent ?? 0) || 0,
        currency: walletRaw?.currency ?? 'USD',
        lastTopedUpAt: walletRaw?.lastTopedUpAt ?? undefined,
      }
      setWallet(normalizedWallet)

      // Sessions
      const sessionsRaw = results[2].status === 'fulfilled' ? results[2].value.data?.data : []
      setSessions(Array.isArray(sessionsRaw) ? sessionsRaw : [])

      // Recent usage — handle both { queries: [...] } and flat array
      const usageRaw = results[3].status === 'fulfilled' ? results[3].value.data?.data : null
      const usageItems = Array.isArray(usageRaw?.queries)
        ? usageRaw.queries
        : Array.isArray(usageRaw?.data)
          ? usageRaw.data
          : Array.isArray(usageRaw)
            ? usageRaw
            : []
      setRecentUsage(usageItems)

      // Budget
      const budgetRaw = results[4].status === 'fulfilled' ? results[4].value.data?.data : null
      setBudget(budgetRaw ?? null)

      // Insights — use normalized data, never raw
      setInsights(generateInsights(normalizedStats, normalizedWallet, budgetRaw))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchDashboard()
    const interval = setInterval(fetchDashboard, 60000)
    return () => clearInterval(interval)
  }, [fetchDashboard])

  return { stats, wallet, sessions, recentUsage, insights, budget, isLoading, error, refetch: fetchDashboard }
}
