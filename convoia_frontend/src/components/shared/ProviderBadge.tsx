import { cn, getProviderBgClass } from '../../lib/utils'

interface ProviderBadgeProps {
  provider: string
  className?: string
}

export function ProviderBadge({ provider, className }: ProviderBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border',
        getProviderBgClass(provider),
        className
      )}
    >
      {provider}
    </span>
  )
}
