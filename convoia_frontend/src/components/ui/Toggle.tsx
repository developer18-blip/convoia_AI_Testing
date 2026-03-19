import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  label?: string
}

export function Toggle({ checked, onChange, disabled, size = 'md', label }: ToggleProps) {
  const trackSize = size === 'sm' ? 'w-9 h-5' : 'w-12 h-6'
  const thumbSize = size === 'sm' ? 14 : 18

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        trackSize,
        checked
          ? 'bg-gradient-to-r from-accent-start to-accent-mid shadow-inner shadow-primary/20'
          : 'bg-surface-3',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="inline-flex items-center justify-center rounded-full bg-white shadow-md"
        style={{
          width: thumbSize,
          height: thumbSize,
          marginTop: (size === 'sm' ? 20 : 24 - thumbSize) / 2,
          marginLeft: checked ? undefined : (size === 'sm' ? 3 : 3),
        }}
        animate={{
          x: checked ? (size === 'sm' ? 16 : 24) : 0,
        }}
      >
        {checked && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-1.5 h-1.5 rounded-full bg-primary"
          />
        )}
      </motion.span>
    </button>
  )
}
