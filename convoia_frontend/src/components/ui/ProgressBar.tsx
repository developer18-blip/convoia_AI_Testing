import { cn } from '../../lib/utils'

interface ProgressBarProps {
  value: number
  max?: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

export function ProgressBar({ value, max = 100, size = 'md', showLabel, className }: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100)

  const getGradient = () => {
    if (percentage < 60) return 'from-emerald-500 to-green-400'
    if (percentage < 80) return 'from-amber-500 to-yellow-400'
    return 'from-red-500 to-rose-400'
  }

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  }

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between text-xs text-text-muted mb-1.5">
          <span className="font-medium">{percentage.toFixed(0)}%</span>
          <span>
            {value.toFixed(2)} / {max.toFixed(2)}
          </span>
        </div>
      )}
      <div className={cn('w-full bg-surface-2 rounded-full overflow-hidden', sizeClasses[size])}>
        <div
          className={cn(
            'h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out relative',
            getGradient()
          )}
          style={{ width: `${percentage}%` }}
        >
          {size === 'lg' && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          )}
        </div>
      </div>
    </div>
  )
}
