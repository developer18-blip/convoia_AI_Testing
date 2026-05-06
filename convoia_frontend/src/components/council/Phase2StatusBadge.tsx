import type { Phase2Status } from '../../types'

interface Props {
  status: Phase2Status | undefined
}

// Replaces the legacy getAgreementLevel() heuristic that was searching for
// phrases the new Day 1 prompt explicitly forbids ("all models agree", etc.).
// Day 2's phase2Status is the ground-truth signal from the backend.
export function Phase2StatusBadge({ status }: Props) {
  if (!status) return null

  switch (status) {
    case 'ok':
      return (
        <span className="council-verdict-badge council-verdict-badge--agree" title="Cross-examination ran cleanly across all models">
          Cross-examined
        </span>
      )
    case 'skipped':
      return (
        <span className="council-verdict-badge council-verdict-badge--agree" title="Models reached substantively similar conclusions; cross-exam skipped">
          Models converged
        </span>
      )
    case 'degraded':
      return (
        <span className="council-verdict-badge council-verdict-badge--mixed" title="Cross-examination step encountered an issue; verdict synthesized from raw responses">
          Cross-exam degraded
        </span>
      )
    case 'degraded_legacy':
      return (
        <span className="council-verdict-badge council-verdict-badge--mixed" title="Legacy fallback path">
          Legacy fallback
        </span>
      )
  }
}
