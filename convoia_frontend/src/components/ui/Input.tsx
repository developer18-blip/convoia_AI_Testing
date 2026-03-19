import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: ReactNode
  rightElement?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, rightElement, className, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const [isFocused, setIsFocused] = useState(false)
    const isPassword = type === 'password'

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-text-secondary mb-1.5">{label}</label>
        )}
        <div className="relative group">
          {icon && (
            <div className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200',
              isFocused ? 'text-primary' : 'text-text-muted'
            )}>
              {icon}
            </div>
          )}
          <input
            ref={ref}
            type={isPassword && showPassword ? 'text' : type}
            onFocus={(e) => { setIsFocused(true); props.onFocus?.(e) }}
            onBlur={(e) => { setIsFocused(false); props.onBlur?.(e) }}
            className={cn(
              'w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
              'hover:border-border/80',
              !!icon && 'pl-10',
              !!(isPassword || rightElement) && 'pr-10',
              error && 'border-danger focus:ring-danger/30 focus:border-danger/50',
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
          {rightElement && !isPassword && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</div>
          )}
        </div>
        {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
