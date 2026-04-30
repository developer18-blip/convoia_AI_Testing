import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
  /** When provided, the whole card becomes a React Router link to this path. */
  to?: string
  /** Optional click handler for non-nav actions (e.g. opening a modal). */
  onClick?: () => void
}

export function StatCard({ title, value, subtitle, icon, trend, trendLabel, className, to, onClick }: StatCardProps) {
  const interactive = Boolean(to || onClick)

  const inner = (
    <motion.div
      whileHover={interactive ? { y: -2 } : undefined}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      role={onClick && !to ? 'button' : undefined}
      tabIndex={onClick && !to ? 0 : undefined}
      className={cn(
        'bg-surface border border-border rounded-2xl p-5 transition-all duration-300 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5',
        interactive && 'cursor-pointer hover:border-primary/40',
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

  if (to) {
    return (
      <Link to={to} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }} aria-label={title}>
        {inner}
      </Link>
    )
  }

  return inner
}
