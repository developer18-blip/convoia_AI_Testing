import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'
import { Spinner } from './Spinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  icon?: ReactNode
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses =
    'relative inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer overflow-hidden'

  const variantClasses = {
    primary:
      'bg-gradient-to-r from-accent-start to-accent-mid text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110',
    secondary:
      'bg-surface-2 hover:bg-surface-3 text-text-primary border border-border hover:border-primary/30',
    ghost:
      'hover:bg-surface-2 text-text-secondary hover:text-text-primary',
    danger:
      'bg-gradient-to-r from-danger to-red-600 text-white shadow-lg shadow-danger/20 hover:shadow-xl hover:shadow-danger/30',
    outline:
      'border border-border hover:border-primary/50 text-text-primary hover:text-primary bg-transparent hover:bg-primary/5',
  }

  const sizeClasses = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2.5',
    lg: 'text-base px-6 py-3',
  }

  return (
    <motion.button
      whileTap={disabled || isLoading ? undefined : { scale: 0.97 }}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      disabled={disabled || isLoading}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {isLoading ? <Spinner size="sm" /> : icon}
      {children}
    </motion.button>
  )
}
