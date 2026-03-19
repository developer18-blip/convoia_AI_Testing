import { cn, getInitials, getAvatarColor } from '../../lib/utils'

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  const sizeClasses = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-12 w-12 text-base',
  }

  return (
    <div
      className={cn(
        'rounded-xl flex items-center justify-center font-bold text-white shrink-0 ring-2 ring-white/10 transition-all',
        getAvatarColor(name),
        sizeClasses[size],
        className
      )}
    >
      {getInitials(name)}
    </div>
  )
}
