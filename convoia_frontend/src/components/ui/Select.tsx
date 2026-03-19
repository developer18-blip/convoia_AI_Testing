import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Array<{ value: string; label: string }>
}

export function Select({ label, error, options, className, ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-text-secondary mb-1.5">{label}</label>
      )}
      <div className="relative">
        <select
          className={cn(
            'w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary transition-all duration-200 appearance-none cursor-pointer pr-9',
            'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
            'hover:border-border/80',
            error && 'border-danger focus:ring-danger/30',
            className
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      </div>
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  )
}
