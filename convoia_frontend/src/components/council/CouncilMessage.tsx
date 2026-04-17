import { useMemo } from 'react'
import { Zap, AlertCircle } from 'lucide-react'
import type { CouncilState } from '../../types'
import { ModelStatusCard } from './ModelStatusCard'
import { CrossExamCard } from './CrossExamCard'
import { VerdictBox, getAgreementLevel } from './VerdictBox'
import { ResponsePanel } from './ResponsePanel'
import { CouncilFooter } from './CouncilFooter'

interface Props {
  council: CouncilState
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

  // Phase 3+ dims the Phase 1 cards (they're secondary now)
  const cardsDim = phase === 'verdict' || phase === 'complete'

  // Cross-exam card visibility: shown from 'crossexam' onward
  const showCrossExam = phase === 'crossexam' || phase === 'crossexam_done' || phase === 'verdict' || phase === 'complete'
  const crossExamActive = phase === 'crossexam'
  // Cross-exam card start time for the live timer: set when we entered crossexam
  const crossExamStart = useMemo(() => Date.now() - (crossExamDurationMs || 0), [phase === 'crossexam'])

  // Verdict visibility: from 'verdict' onward
  const showVerdict = phase === 'verdict' || phase === 'complete'
  const verdictStreaming = phase === 'verdict'

  // Responses + footer: only after 'complete'
  const showResponses = phase === 'complete' && modelResponses.length > 0
  const showFooter = phase === 'complete' && meta

  return (
    <div style={{ marginBottom: '28px', animation: 'fadeSlideIn 200ms ease-out' }}>
      <style>{`@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Council header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: 30, height: 30, borderRadius: '9px',
          background: 'linear-gradient(135deg, #F59E0B, #D97706)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Zap size={15} color="white" fill="white" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--chat-text, var(--color-text-primary))' }}>
            ConvoiaAI Council
          </div>
          <div style={{ fontSize: '11px', color: 'var(--chat-text-muted, var(--color-text-muted))' }}>
            {totalCount > 0 ? `${totalCount} models · ${phase === 'complete' ? 'Complete' : phase === 'error' ? 'Error' : 'Running…'}` : 'Starting…'}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {phase === 'error' && (
        <div style={{
          padding: '10px 12px', borderRadius: '10px', marginBottom: '10px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          display: 'flex', alignItems: 'center', gap: '10px', color: '#DC2626', fontSize: '13px',
        }}>
          <AlertCircle size={16} />
          <span>{errorMessage || 'Council failed'}</span>
        </div>
      )}

      {/* Phase 1: Model cards */}
      {totalCount > 0 && (
        <div style={{ opacity: cardsDim ? 0.55 : 1, transition: 'opacity 350ms ease' }}>
          {models
            .slice()
            .sort((a, b) => a.modelIndex - b.modelIndex)
            .map((m) => <ModelStatusCard key={m.modelIndex} model={m} />)}
        </div>
      )}

      {/* Progress bar (hidden after phase 1) */}
      {totalCount > 0 && phase === 'executing' && (
        <div style={{ marginTop: '8px', marginBottom: '4px' }}>
          <div style={{
            height: 3, borderRadius: '100px',
            background: 'var(--color-border, rgba(0,0,0,0.08))', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${progressPct}%`,
              background: doneCount === totalCount ? '#22C55E' : '#F59E0B',
              transition: 'width 300ms ease, background 300ms ease',
            }} />
          </div>
          <div style={{ marginTop: 4, fontSize: '11px', color: 'var(--chat-text-muted)' }}>
            {progressLabel}
          </div>
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
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--chat-text-muted)', marginBottom: '6px' }}>
            Individual model responses
          </div>
          {modelResponses.map((r, i) => <ResponsePanel key={`${r.name}-${i}`} resp={r} />)}
        </div>
      )}

      {/* Footer */}
      {showFooter && meta && <CouncilFooter meta={meta} />}
    </div>
  )
}
