import { AlertTriangle, Lightbulb, CheckCircle, Info } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { InsightData } from '../../types'

const iconMap = {
  warning: AlertTriangle,
  tip: Lightbulb,
  success: CheckCircle,
  info: Info,
}

const colorMap = {
  warning: 'border-warning/20 bg-warning/5',
  tip: 'border-primary/20 bg-primary/5',
  success: 'border-success/20 bg-success/5',
  info: 'border-info/20 bg-info/5',
}

const iconColorMap = {
  warning: 'text-warning',
  tip: 'text-primary',
  success: 'text-success',
  info: 'text-info',
}

export function InsightCard({ insight }: { insight: InsightData }) {
  const Icon = iconMap[insight.type]

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-2xl border min-w-[280px] transition-all duration-200 hover:shadow-md',
        colorMap[insight.type]
      )}
    >
      <div className="p-1.5 rounded-lg bg-white/5">
        <Icon size={16} className={cn('shrink-0', iconColorMap[insight.type])} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary">{insight.title}</p>
        <p className="text-xs text-text-muted mt-0.5">{insight.description}</p>
        {insight.action && (
          <button
            onClick={insight.action.onClick}
            className="text-xs text-primary hover:text-primary-hover mt-1.5 font-semibold transition-colors"
          >
            {insight.action.label}
          </button>
        )}
      </div>
    </div>
  )
}
