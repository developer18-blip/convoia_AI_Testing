import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'
import { TrendBadge } from './TrendBadge'

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  icon?: ReactNode
  trend?: number
  trendLabel?: string
  className?: string
}

export function StatCard({ title, value, subtitle, icon, trend, trendLabel, className }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'bg-surface border border-border rounded-2xl p-5 transition-all duration-300 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-text-muted">{title}</p>
        {icon && (
          <div className="p-2 bg-primary/10 rounded-xl text-primary">
            {icon}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-text-primary mb-1">{value}</p>
      <div className="flex items-center gap-2">
        {trend !== undefined && <TrendBadge value={trend} />}
        {(subtitle || trendLabel) && (
          <p className="text-xs text-text-muted">{subtitle || trendLabel}</p>
        )}
      </div>
    </motion.div>
  )
}
