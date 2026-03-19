import { DollarSign } from 'lucide-react'
import type { AIModel } from '../../types'

interface CostEstimatorProps {
  model: AIModel | null
  tokenEstimate?: number
}

export function CostEstimator({ model, tokenEstimate = 500 }: CostEstimatorProps) {
  if (!model) return null
  if (!tokenEstimate || isNaN(tokenEstimate)) return null

  const inputCost = (tokenEstimate / 1_000_000) * (model.inputTokenPrice ?? 0) * (1 + (model.markupPercentage ?? 0) / 100)
  const outputCost = (tokenEstimate / 1_000_000) * (model.outputTokenPrice ?? 0) * (1 + (model.markupPercentage ?? 0) / 100)
  const totalEstimate = inputCost + outputCost
  if (isNaN(totalEstimate)) return null

  return (
    <div className="flex items-center gap-1.5 text-xs text-text-muted">
      <DollarSign size={12} />
      <span>~${totalEstimate.toFixed(4)}/query</span>
    </div>
  )
}
