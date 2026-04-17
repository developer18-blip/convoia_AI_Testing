import { renderCouncilVerdict } from './verdictRenderer'

interface Props {
  verdict: string
  isStreaming: boolean
  agreementLevel: { text: string; color: 'green' | 'amber' }
}

export function VerdictBox({ verdict, isStreaming, agreementLevel }: Props) {
  const badgeClass = agreementLevel.color === 'green'
    ? 'council-verdict-badge--agree'
    : 'council-verdict-badge--mixed'

  return (
    <div className="council-verdict-card">
      <div className="council-verdict-header">
        <div className="council-verdict-icon">C</div>
        <div className="council-verdict-title">ConvoiaAI Council</div>
        <div className={`council-verdict-badge ${badgeClass}`}>
          {agreementLevel.text}
        </div>
      </div>
      <div className="council-verdict-body">
        {renderCouncilVerdict(verdict, isStreaming)}
      </div>
    </div>
  )
}

export function getAgreementLevel(verdict: string): { text: string; color: 'green' | 'amber' } {
  const lower = verdict.toLowerCase()
  const agree = ['all models agree', 'all three agree', 'consensus', 'converge on', 'unanimously', 'strong agreement', 'models aligned']
  const disagree = ['diverged', 'disagreed', 'split', 'mixed views', 'no consensus', 'conflicting']
  const agreeScore = agree.filter((s) => lower.includes(s)).length
  const disagreeScore = disagree.filter((s) => lower.includes(s)).length
  if (agreeScore > disagreeScore) return { text: 'High agreement', color: 'green' }
  return { text: 'Mixed views', color: 'amber' }
}
