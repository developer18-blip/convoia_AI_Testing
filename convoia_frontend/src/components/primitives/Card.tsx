import { HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'raised' | 'muted'
  padding?: 'sm' | 'md' | 'lg' | 'none'
  accent?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', accent, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`card card--${variant} card--p-${padding} ${accent ? 'card--accent' : ''} ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = 'Card'
