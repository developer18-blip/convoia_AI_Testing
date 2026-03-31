export const formatCost = (cost: number | undefined | null): string => {
  const value = Number(cost ?? 0)
  if (isNaN(value)) return '$0.000000'
  return `$${value.toFixed(6)}`
}

export const formatCostShort = (cost: number | undefined | null): string => {
  const value = Number(cost ?? 0)
  if (isNaN(value)) return '$0.00'
  return `$${value.toFixed(2)}`
}

export const formatTokens = (tokens: number | undefined | null): string => {
  const value = Number(tokens ?? 0)
  if (isNaN(value)) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

export const formatTrend = (
  current: number | undefined | null,
  previous: number | undefined | null
): { value: number; isPositive: boolean } => {
  const curr = Number(current ?? 0)
  const prev = Number(previous ?? 0)
  if (!prev || prev === 0) return { value: 0, isPositive: true }
  const change = ((curr - prev) / prev) * 100
  return {
    value: Math.abs(Math.round(change)),
    isPositive: change >= 0,
  }
}

export { getGreeting } from './utils'

export const getDaysRemaining = (balance: number, monthlySpend: number): number => {
  const dayOfMonth = new Date().getDate()
  if (dayOfMonth === 0 || monthlySpend === 0) return 999
  const dailyRate = monthlySpend / dayOfMonth
  if (dailyRate === 0) return 999
  return Math.floor(balance / dailyRate)
}

export const getProjectedEOM = (monthlySpend: number): number => {
  const dayOfMonth = new Date().getDate()
  if (dayOfMonth === 0) return 0
  const dailyRate = monthlySpend / dayOfMonth
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  return dailyRate * daysInMonth
}
