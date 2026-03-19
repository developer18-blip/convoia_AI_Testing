import type { ReactNode, HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  glow?: boolean
  padding?: 'sm' | 'md' | 'lg' | 'none'
}

export function Card({ children, hover, glow, padding = 'md', className, ...props }: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
  }

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-2xl transition-all duration-300',
        paddingClasses[padding],
        hover && 'hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 cursor-pointer',
        glow && 'glow-primary',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
