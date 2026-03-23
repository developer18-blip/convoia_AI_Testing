import { useState } from 'react'
import { cn, getInitials, getAvatarColor } from '../../lib/utils'

interface AvatarProps {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const [imgError, setImgError] = useState(false)

  const sizeClasses = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-20 w-20 text-2xl',
  }

  const showImage = src && !imgError

  return (
    <div
      className={cn(
        'rounded-xl flex items-center justify-center font-bold text-white shrink-0 ring-2 ring-white/10 transition-all overflow-hidden',
        !showImage && getAvatarColor(name),
        sizeClasses[size],
        className
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  )
}
