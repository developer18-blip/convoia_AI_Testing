import { AlertCircle } from 'lucide-react'
import { Button } from '../ui/Button'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export function ErrorState({
  message = 'Something went wrong',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <AlertCircle size={48} className="text-danger mb-4" />
      <h3 className="text-lg font-semibold text-text-primary mb-2">Error</h3>
      <p className="text-sm text-text-muted text-center max-w-sm mb-6">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  )
}
