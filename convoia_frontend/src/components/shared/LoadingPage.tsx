import { StatCardSkeleton, ChartSkeleton } from '../ui/Skeleton'

export function LoadingPage() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <ChartSkeleton />
    </div>
  )
}
