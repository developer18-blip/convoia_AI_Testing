import type { HTMLAttributes, ReactNode } from 'react'

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'error'
  mono?: boolean
  icon?: ReactNode
}

export function Pill({ variant = 'default', mono, icon, className = '', children, ...props }: PillProps) {
  return (
    <span
      className={`pill pill--${variant} ${mono ? 'pill--mono' : ''} ${className}`}
      {...props}
    >
      {icon && <span className="pill__icon">{icon}</span>}
      <span>{children}</span>
    </span>
  )
}
