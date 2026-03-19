import { cn } from '../../lib/utils'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
}

export function Skeleton({ className, variant = 'text' }: SkeletonProps) {
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
  }

  return (
    <div
      className={cn(
        'animate-pulse bg-surface-2',
        variantClasses[variant],
        className
      )}
    />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

export function ChartSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <Skeleton className="h-5 w-40 mb-4" />
      <Skeleton variant="rectangular" className="h-64 w-full" />
    </div>
  )
}
