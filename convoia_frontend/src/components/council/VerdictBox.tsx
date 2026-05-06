import type { Phase2Status } from '../../types'
import { renderCouncilVerdict } from './verdictRenderer'
import { Phase2StatusBadge } from './Phase2StatusBadge'

interface Props {
  verdict: string
  isStreaming: boolean
  phase2Status?: Phase2Status
  degradedNote?: string
}

export function VerdictBox({ verdict, isStreaming, phase2Status, degradedNote }: Props) {
  return (
    <div className="council-verdict-card">
      <div className="council-verdict-header">
        <div className="council-verdict-icon">C</div>
        <div className="council-verdict-title">ConvoiaAI Apex</div>
        <Phase2StatusBadge status={phase2Status} />
        {degradedNote && (
          <span
            className="council-verdict-badge council-verdict-badge--mixed"
            title="One or more models failed to respond — verdict synthesized from successful responses"
            style={{ marginLeft: 6 }}
          >
            {degradedNote}
          </span>
        )}
      </div>
      <div className="council-verdict-body">
        {renderCouncilVerdict(verdict, isStreaming)}
      </div>
    </div>
  )
}
