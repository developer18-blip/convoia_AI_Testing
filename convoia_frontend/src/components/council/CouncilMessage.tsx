import { useMemo } from 'react'
import { AlertCircle } from 'lucide-react'
import type { CouncilState, CouncilPhase } from '../../types'
import { ModelStatusCard } from './ModelStatusCard'
import { CrossExamCard } from './CrossExamCard'
import { VerdictBox, getAgreementLevel } from './VerdictBox'
import { ResponsePanel } from './ResponsePanel'
import { CouncilFooter } from './CouncilFooter'

interface Props {
  council: CouncilState
}

function badgeForPhase(phase: CouncilPhase, modelCount: number): { label: string; cls: string } {
  switch (phase) {
    case 'executing':
      return { label: modelCount > 0 ? `${modelCount} models running` : 'Running…', cls: 'council-badge--executing' }
    case 'crossexam':
    case 'crossexam_done':
      return { label: 'Cross-examining', cls: 'council-badge--synthesizing' }
    case 'verdict':
      return { label: 'Synthesizing verdict', cls: 'council-badge--synthesizing' }
    case 'complete':
      return { label: 'Complete', cls: 'council-badge--complete' }
    case 'error':
      return { label: 'Error', cls: 'council-badge--error' }
    default:
      return { label: 'Council', cls: 'council-badge--selecting' }
  }
}

export function CouncilMessage({ council }: Props) {
  const { phase, models, verdict, modelResponses, crossExamStatus, crossExamDurationMs, meta, errorMessage } = council

  const completedCount = models.filter((m) => m.status === 'complete').length
  const errorCount = models.filter((m) => m.status === 'error').length
  const totalCount = models.length
  const doneCount = completedCount + errorCount
  const progressPct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0
  const progressLabel = totalCount === 0
    ? 'Preparing council…'
    : errorCount > 0 && doneCount === totalCount
      ? `${completedCount} of ${totalCount} succeeded — proceeding with ${completedCount} models`
      : doneCount === totalCount
        ? 'All models complete'
        : `${completedCount} of ${totalCount} models complete`

  const agreementLevel = useMemo(() => getAgreementLevel(verdict), [verdict])

  const cardsDim = phase === 'verdict' || phase === 'complete'
  const showCrossExam = phase === 'crossexam' || phase === 'crossexam_done' || phase === 'verdict' || phase === 'complete'
  const crossExamActive = phase === 'crossexam'
  const crossExamStart = useMemo(
    () => Date.now() - (crossExamDurationMs || 0),
    // intentionally only set when entering crossexam phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase === 'crossexam'],
  )

  const showVerdict = phase === 'verdict' || phase === 'complete'
  const verdictStreaming = phase === 'verdict'
  const showResponses = phase === 'complete' && modelResponses.length > 0
  const showFooter = phase === 'complete' && meta
  const showProgress = totalCount > 0 && phase === 'executing'

  const badge = badgeForPhase(phase, totalCount)

  return (
    <div style={{ marginBottom: '28px', animation: 'fadeSlideIn 200ms ease-out' }}>
      <style>{`@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Council header — the MessageBubble avatar already shows the ⚡ icon,
          so we only render title + status + badge here (no duplicate circle). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--council-text)' }}>
            ConvoiaAI Council
          </div>
          <div style={{ fontSize: '11px', color: 'var(--council-text-dim)', marginTop: 1 }}>
            {totalCount > 0 ? `${totalCount} models consulted` : 'Starting…'}
          </div>
        </div>
        <span className={`council-badge ${badge.cls}`}>{badge.label}</span>
      </div>

      {/* Error banner */}
      {phase === 'error' && (
        <div style={{
          padding: '10px 12px', borderRadius: '10px', marginBottom: '10px',
          background: 'var(--council-red-bg)', border: '0.5px solid var(--council-red-border)',
          display: 'flex', alignItems: 'center', gap: '10px',
          color: 'var(--council-red)', fontSize: '13px',
        }}>
          <AlertCircle size={16} />
          <span>{errorMessage || 'Council failed'}</span>
        </div>
      )}

      {/* Phase 1: Model cards */}
      {totalCount > 0 && (
        <div>
          {models
            .slice()
            .sort((a, b) => a.modelIndex - b.modelIndex)
            .map((m) => <ModelStatusCard key={m.modelIndex} model={m} dimmed={cardsDim} />)}
        </div>
      )}

      {/* Progress bar (hidden once Phase 1 is done) */}
      {showProgress && (
        <div className="council-progress">
          <div className="council-progress-track">
            <div
              className={`council-progress-fill ${doneCount === totalCount ? 'council-progress-fill--complete' : 'council-progress-fill--active'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="council-progress-label">{progressLabel}</div>
        </div>
      )}

      {/* Phase 2: Cross-exam card */}
      {showCrossExam && (
        <CrossExamCard
          phase={crossExamActive ? 'active' : 'complete'}
          status={crossExamStatus || 'Cross-examining responses for disagreements and blind spots…'}
          durationMs={crossExamDurationMs}
          modelsAnalyzed={completedCount}
          startTime={crossExamActive ? crossExamStart : undefined}
        />
      )}

      {/* Phase 3: Verdict */}
      {showVerdict && verdict && (
        <VerdictBox verdict={verdict} isStreaming={verdictStreaming} agreementLevel={agreementLevel} />
      )}

      {/* Phase 4: Individual responses */}
      {showResponses && (
        <div>
          <div className="council-responses-label">Individual model responses</div>
          {modelResponses.map((r, i) => <ResponsePanel key={`${r.name}-${i}`} resp={r} />)}
        </div>
      )}

      {/* Footer */}
      {showFooter && meta && <CouncilFooter meta={meta} />}
    </div>
  )
}
