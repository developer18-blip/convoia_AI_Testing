import { useChat } from '../../hooks/useChat'
import type { CouncilModelState, CouncilPhase, CouncilState, Message } from '../../types'
import { inferProvider } from './councilConstants'
import {
  ApolloPanel,
  PHASE_TIMING,
  type ApolloModelStatus,
  type ApolloPanelModel,
  type ApolloPanelProps,
  type ApolloPanelState,
  type ApolloProvider,
} from './ApolloPanel'

/**
 * ApolloPanelHost — sits at the top of the chat layout, reads
 * `currentApolloTurnId` from ChatContext, resolves the matching message,
 * and translates its CouncilState into ApolloPanel props.
 *
 * Renders nothing when:
 *  - no Apollo turn is active in this session (`currentApolloTurnId === null`)
 *  - the resolved message has no `council` field (defensive guard)
 *
 * Past Apollo turns from earlier sessions never hit this — the id is
 * cleared on conversation switch, logout, and any non-council send.
 */

function mapPhaseToPanelState(phase: CouncilPhase): ApolloPanelState {
  switch (phase) {
    case 'executing': return 'running'
    case 'crossexam':
    case 'crossexam_done':
    case 'verdict':
      return 'cross-examining'
    case 'complete': return 'done'
    case 'error': return 'error'
    default: return 'running'
  }
}

function mapModelStatus(s: CouncilModelState['status']): ApolloModelStatus {
  switch (s) {
    case 'waiting': return 'pending'
    case 'thinking': return 'running'
    case 'complete': return 'done'
    case 'error': return 'error'
  }
}

function expectedMsFor(provider: string): number {
  switch (provider) {
    case 'anthropic': return PHASE_TIMING.claude
    case 'openai': return PHASE_TIMING.gpt
    case 'google': return PHASE_TIMING.gemini
    default: return PHASE_TIMING.default
  }
}

function deriveModels(council: CouncilState): ApolloPanelModel[] {
  // Index full response bodies by model display-name (council_responses SSE
  // delivers {name, response, ...} once the turn completes). Used to populate
  // the per-model "View response" drill-down.
  const responseByName = new Map<string, string>()
  for (const r of council.modelResponses) {
    if (r?.name) responseByName.set(r.name, r.response || '')
  }

  return council.models
    .slice()
    .sort((a, b) => a.modelIndex - b.modelIndex)
    .map((m) => {
      const provider = inferProvider(m.modelName) as ApolloProvider
      const status = mapModelStatus(m.status)
      const finishedAt =
        status === 'done' && m.durationMs > 0 && m.startTime > 0
          ? m.startTime + m.durationMs
          : status === 'error'
            ? m.startTime || null
            : null
      return {
        id: `model-${m.modelIndex}`,
        provider,
        displayName: m.modelName,
        status,
        startTime: m.startTime || null,
        finishedAt,
        expectedMs: expectedMsFor(provider),
        tokens: m.tokenCount || 0,
        errorMessage: m.error,
        response: responseByName.get(m.modelName),
      }
    })
}

function deriveTotalTokens(council: CouncilState): number {
  // Running mode: sum tokens from completed-only models (Q1 — caller's choice
  // to show a ticking running sum that snaps up as each model finishes).
  // Done mode: prefer the authoritative meta value baked at stream-end.
  if (council.meta?.totalTokens) return council.meta.totalTokens
  return council.models.reduce((acc, m) => acc + (m.status === 'complete' ? (m.tokenCount || 0) : 0), 0)
}

function deriveTotalCost(council: CouncilState): number {
  if (council.meta?.totalCost) return Number(council.meta.totalCost) || 0
  // No per-model cost available pre-completion. Caller's panel just shows
  // $0.0000 while running — matches Q1's "completed-only" semantics.
  return 0
}

export function buildApolloPanelProps(message: Message): ApolloPanelProps | null {
  const council = message.council
  if (!council) return null

  const state = mapPhaseToPanelState(council.phase)
  const models = deriveModels(council)
  const totalTokens = deriveTotalTokens(council)
  const totalCost = deriveTotalCost(council)

  // Turn start = earliest model.startTime, or the assistant message timestamp
  // as a last-resort fallback (Apollo turns always start at least one model).
  const startedTimestamps = council.models.map((m) => m.startTime).filter((t) => t > 0)
  const turnStartTime = startedTimestamps.length > 0
    ? Math.min(...startedTimestamps)
    : Date.parse(message.timestamp) || null

  return {
    state,
    models,
    synthesisStartTime: council.synthesisStartedAt ?? null,
    synthesisFinishedAt: council.phase === 'complete' ? (council.turnFinishedAt ?? null) : null,
    synthesisExpectedMs: PHASE_TIMING.synthesis,
    totalTokens,
    totalCost,
    turnStartTime,
    turnFinishedAt: council.turnFinishedAt ?? null,
    live: council.phase !== 'complete' && council.phase !== 'error',
  }
}

export function ApolloPanelHost() {
  const { currentApolloTurnId, setCurrentApolloTurnId, messages } = useChat()
  if (!currentApolloTurnId) return null
  const msg = messages.find((m) => m.id === currentApolloTurnId)
  if (!msg || !msg.council) return null

  const props = buildApolloPanelProps(msg)
  if (!props) return null

  return <ApolloPanel {...props} onClose={() => setCurrentApolloTurnId(null)} />
}
