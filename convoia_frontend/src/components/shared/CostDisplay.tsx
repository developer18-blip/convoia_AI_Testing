import { cn, formatCurrency } from '../../lib/utils'

interface CostDisplayProps {
  amount: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function CostDisplay({ amount, size = 'sm', className }: CostDisplayProps) {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl font-semibold',
  }

  return (
    <span className={cn('font-mono', sizeClasses[size], className)}>
      {formatCurrency(amount)}
    </span>
  )
}
