import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary'
  size?: 'sm' | 'md'
  dot?: boolean
  children: ReactNode
  className?: string
}

export function Badge({ variant = 'default', size = 'sm', dot, children, className }: BadgeProps) {
  const variantClasses = {
    default: 'bg-surface-2 text-text-secondary border-border',
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
    info: 'bg-info/10 text-info border-info/20',
    primary: 'bg-primary/10 text-primary border-primary/20',
  }

  const dotColors = {
    default: 'bg-text-muted',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    primary: 'bg-primary',
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border transition-colors duration-200',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />
      )}
      {children}
    </span>
  )
}
