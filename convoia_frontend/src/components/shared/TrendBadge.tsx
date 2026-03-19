import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '../../lib/utils'

interface TrendBadgeProps {
  value: number
  className?: string
}

export function TrendBadge({ value, className }: TrendBadgeProps) {
  if (value === 0) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-text-muted', className)}>
        <Minus size={12} />
        0%
      </span>
    )
  }

  const isPositive = value > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        isPositive ? 'text-success' : 'text-danger',
        className
      )}
    >
      {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}
