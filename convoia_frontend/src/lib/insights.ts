import type { DashboardStats, Wallet, Budget, InsightData } from '../types'

export function generateInsights(
  stats: DashboardStats | null,
  wallet: Wallet | null,
  budget?: Budget | null
): InsightData[] {
  const insights: InsightData[] = []
  if (!stats || !wallet) return insights

  const thisMonthCost = Number(stats.thisMonth?.cost ?? 0) || 0
  const lastMonthCost = Number(stats.lastMonth?.cost ?? 0) || 0
  const todayQueries = Number(stats.today?.queries ?? 0) || 0
  const thisWeekQueries = Number(stats.thisWeek?.queries ?? 0) || 0
  const walletBalance = Number(wallet.balance ?? 0) || 0
  const topModels = Array.isArray(stats.topModels) ? stats.topModels : []

  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const dayOfMonth = new Date().getDate()
  const projectedEOM = dayOfMonth > 0 ? (thisMonthCost / dayOfMonth) * daysInMonth : 0
  const dailyRate = dayOfMonth > 0 ? thisMonthCost / dayOfMonth : 0

  if (budget) {
    const monthlyCap = Number(budget.monthlyCap ?? 0) || 0
    if (monthlyCap > 0 && projectedEOM > monthlyCap * 0.9) {
      insights.push({
        type: 'warning',
        title: 'On pace to exceed budget',
        description: `Projected $${projectedEOM.toFixed(2)} this month vs $${monthlyCap.toFixed(2)} budget cap.`,
        icon: 'alert-triangle',
      })
    }
  }

  const gpt4oUsage = topModels.find(
    (m) => m.name?.toLowerCase().includes('gpt-4o') && !m.name?.toLowerCase().includes('mini')
  )
  if (gpt4oUsage && (Number(gpt4oUsage.queries) || 0) > 100) {
    const potentialSavings = (Number(gpt4oUsage.cost) || 0) * 0.6
    insights.push({
      type: 'tip',
      title: 'Switch to GPT-4o-mini for simple queries',
      description: `You've used GPT-4o for ${gpt4oUsage.queries} queries. Switching simple ones to mini could save ~$${potentialSavings.toFixed(2)}.`,
      icon: 'lightbulb',
    })
  }

  if (dailyRate > 0 && walletBalance > 0) {
    const daysRemaining = Math.floor(walletBalance / dailyRate)
    if (daysRemaining < 3) {
      insights.push({
        type: 'warning',
        title: 'Wallet running low',
        description: `At your current pace, your wallet runs out in ~${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}. Consider topping up.`,
        icon: 'wallet',
      })
    }
  }

  if (lastMonthCost > 0 && thisMonthCost < lastMonthCost * 0.8) {
    const savings = ((1 - thisMonthCost / lastMonthCost) * 100).toFixed(0)
    insights.push({
      type: 'success',
      title: 'Spending down this month',
      description: `You're spending ${savings}% less than last month. Great cost management!`,
      icon: 'trending-down',
    })
  }

  if (todayQueries === 0 && thisWeekQueries === 0) {
    insights.push({
      type: 'info',
      title: 'Welcome back!',
      description: "You haven't used Convoia recently. Pick up where you left off.",
      icon: 'sparkles',
    })
  }

  return insights
}
