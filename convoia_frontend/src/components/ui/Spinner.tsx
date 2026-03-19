import { cn } from '../../lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-8 w-8',
  }

  return (
    <div className={cn('relative', sizeClasses[size], className)}>
      <svg
        className="animate-spin text-current"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        width="100%"
        height="100%"
      >
        <circle className="opacity-10" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path
          className="opacity-90"
          fill="none"
          stroke="url(#spinner-gradient)"
          strokeWidth="3"
          strokeLinecap="round"
          d="M12 2a10 10 0 0 1 10 10"
        />
        <defs>
          <linearGradient id="spinner-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
