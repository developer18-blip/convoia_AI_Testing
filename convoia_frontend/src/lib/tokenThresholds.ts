// Low-balance warning thresholds derived from user's largest purchase in the
// last 90 days. Two tiers:
//   - WARNING: max(10% of largest purchase, 100K) capped at 5M
//   - CRITICAL: max(2% of largest purchase, 25K) capped at 1M
// If the user has no purchase history (free tier or no recent purchase),
// fall back to the static floors. The floor + ceiling clamp prevents a
// pathologically small purchase from setting an unhelpfully tiny warning,
// and prevents a whale-sized purchase from putting the warning so high
// that mid-tier users would be permanently in "warning" state.

export interface TokenThresholds {
  warning: number
  critical: number
}

const STATIC_WARNING_FLOOR = 100_000
const STATIC_CRITICAL_FLOOR = 25_000
const WARNING_PERCENT = 0.10
const CRITICAL_PERCENT = 0.02
const WARNING_CEILING = 5_000_000
const CRITICAL_CEILING = 1_000_000

export function computeTokenThresholds(largestPurchase: number | null | undefined): TokenThresholds {
  if (!largestPurchase || largestPurchase <= 0 || !Number.isFinite(largestPurchase)) {
    return { warning: STATIC_WARNING_FLOOR, critical: STATIC_CRITICAL_FLOOR }
  }
  const warning = Math.min(
    WARNING_CEILING,
    Math.max(STATIC_WARNING_FLOOR, Math.floor(largestPurchase * WARNING_PERCENT)),
  )
  const critical = Math.min(
    CRITICAL_CEILING,
    Math.max(STATIC_CRITICAL_FLOOR, Math.floor(largestPurchase * CRITICAL_PERCENT)),
  )
  return { warning, critical }
}

export type TokenLevel = 'normal' | 'warning' | 'critical'

export function tokenLevelForBalance(balance: number, t: TokenThresholds): TokenLevel {
  if (balance <= t.critical) return 'critical'
  if (balance <= t.warning) return 'warning'
  return 'normal'
}
