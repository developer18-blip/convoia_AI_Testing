import type { CouncilMeta } from '../../types'

interface Props {
  meta: CouncilMeta
}

export function CouncilFooter({ meta }: Props) {
  const seconds = meta.totalDurationMs ? (meta.totalDurationMs / 1000).toFixed(1) : null
  return (
    <div className="council-footer">
      <span className="council-footer-stats">
        {meta.totalTokens.toLocaleString()} tokens · ${Number(meta.totalCost).toFixed(4)}{seconds ? ` · ${seconds}s` : ''}
      </span>
      <span className="council-footer-mod">Moderated by ConvoiaAI</span>
    </div>
  )
}
