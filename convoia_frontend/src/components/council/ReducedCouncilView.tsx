import { AlertTriangle } from 'lucide-react'
import type { CouncilModelResponse } from '../../types'
import { ResponsePanel } from './ResponsePanel'

interface Props {
  singleResponse: CouncilModelResponse
  totalAttempted: number
  errorMessage?: string
}

// Shown when fewer than 2 of N council models responded successfully but
// at least 1 did. Surfaces the salvaged response so the user gets value
// instead of a hard error. Recovery: user edits their prior message or retries.
export function ReducedCouncilView({ singleResponse, totalAttempted, errorMessage }: Props) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: '12px',
        marginBottom: '12px',
        background: 'var(--council-amber-bg, rgba(245, 158, 11, 0.08))',
        border: '1px solid var(--council-amber-border, rgba(245, 158, 11, 0.25))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
        <AlertTriangle size={16} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--council-text)' }}>
            Apex couldn't reach consensus
          </div>
          <div style={{ fontSize: '12px', color: 'var(--council-text-dim)', marginTop: 2 }}>
            Only 1 of {totalAttempted} models responded successfully. Showing the response from {singleResponse.name}:
          </div>
          {errorMessage && (
            <div style={{ fontSize: '11px', color: 'var(--council-text-dim)', marginTop: 4, opacity: 0.7 }}>
              ({errorMessage})
            </div>
          )}
        </div>
      </div>
      <ResponsePanel resp={singleResponse} forceOpen={true} />
    </div>
  )
}
