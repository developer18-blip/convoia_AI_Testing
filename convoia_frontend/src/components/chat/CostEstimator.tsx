import { DollarSign } from 'lucide-react'
import type { AIModel } from '../../types'

interface CostEstimatorProps {
  // Single-model mode: pass model. Council mode: pass councilModels (>=2).
  // If both are absent or council has fewer than 2 models, the component renders nothing.
  model?: AIModel | null
  councilModels?: AIModel[]
  tokenEstimate?: number
}

// Council pre-flight constants — must match backend councilService.ts:131-134
// so the frontend estimate aligns with the actual pre-flight balance check.
// Note: AIModel.{input,output}TokenPrice are stored as $/token (not $/million),
// matching how the backend formula uses them (no division). The previous version
// of this file divided by 1_000_000, which produced ~$0.00 estimates that
// silently rounded to zero — fixed here to match backend pricing units.
const COUNCIL_PER_MODEL_OUTPUT = 2000
const COUNCIL_CROSSEXAM_OUTPUT = 4000
const COUNCIL_VERDICT_OUTPUT = 1500
const COUNCIL_MARKUP = 1.275 // unified Convoia policy

export function CostEstimator({ model, councilModels, tokenEstimate = 500 }: CostEstimatorProps) {
  // Council mode takes priority when 2+ models are passed
  if (councilModels && councilModels.length >= 2) {
    const totalOutputTokens =
      councilModels.length * COUNCIL_PER_MODEL_OUTPUT +
      COUNCIL_CROSSEXAM_OUTPUT +
      COUNCIL_VERDICT_OUTPUT
    const maxOutputPrice = Math.max(...councilModels.map((m) => Number(m.outputTokenPrice ?? 0)))
    if (!isFinite(maxOutputPrice) || maxOutputPrice <= 0) return null
    const estimatedCost = totalOutputTokens * maxOutputPrice * COUNCIL_MARKUP
    if (!isFinite(estimatedCost) || isNaN(estimatedCost)) return null

    return (
      <div
        className="flex items-center gap-1.5 text-xs text-text-muted"
        title="Apollo uses parallel model calls + cross-examination + verdict synthesis. Actual cost varies with response length."
      >
        <DollarSign size={12} />
        <span>
          estimated ~${estimatedCost.toFixed(2)} / query · {councilModels.length} models + cross-exam
        </span>
      </div>
    )
  }

  // Single-model mode
  if (!model) return null
  if (!tokenEstimate || isNaN(tokenEstimate)) return null

  const inputCost = tokenEstimate * Number(model.inputTokenPrice ?? 0) * (1 + (model.markupPercentage ?? 0) / 100)
  const outputCost = tokenEstimate * Number(model.outputTokenPrice ?? 0) * (1 + (model.markupPercentage ?? 0) / 100)
  const totalEstimate = inputCost + outputCost
  if (isNaN(totalEstimate)) return null

  return (
    <div className="flex items-center gap-1.5 text-xs text-text-muted">
      <DollarSign size={12} />
      <span>~${totalEstimate.toFixed(4)}/query</span>
    </div>
  )
}
