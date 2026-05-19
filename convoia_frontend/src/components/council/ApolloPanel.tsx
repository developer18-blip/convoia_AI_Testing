import { useEffect, useRef, useState } from 'react'
import { Check, Circle, GitMerge, Sparkles } from 'lucide-react'

// ── Static phase-timing config ──────────────────────────────────────────────
// TODO Day-4+: replace with rolling avg from last 5 Apollo runs in
// localStorage; fall back to these constants. See apollo_ui_v2 memory entry Q5.
export const PHASE_TIMING = {
  claude: 18000,
  gpt: 10000,
  gemini: 22000,
  synthesis: 10000,
  default: 15000,
} as const

export const MODEL_PHASES = ['Reading', 'Thinking', 'Writing', 'Checking'] as const
export const SYNTHESIS_PHASES = [
  'Reading responses',
  'Comparing',
  'Resolving conflicts',
  'Synthesizing',
] as const

// ── Types ───────────────────────────────────────────────────────────────────

export type ApolloProvider =
  | 'anthropic' | 'openai' | 'google' | 'deepseek'
  | 'mistral' | 'perplexity' | 'xai' | 'meta' | 'cohere' | 'default'

export type ApolloModelStatus = 'pending' | 'running' | 'done' | 'error'

export interface ApolloPanelModel {
  id: string
  provider: ApolloProvider
  displayName: string
  status: ApolloModelStatus
  /** ms timestamp when the model started. null when pending. */
  startTime: number | null
  /** ms timestamp when the model finished. null while running. */
  finishedAt: number | null
  /** Expected total ms for this model (drives phase progression timing). */
  expectedMs: number
  tokens?: number
  errorMessage?: string
}

export type ApolloPanelState = 'running' | 'cross-examining' | 'done' | 'error'

export interface ApolloPanelProps {
  state: ApolloPanelState
  models: ApolloPanelModel[]
  /** ms timestamp when cross-examining began. null when not yet. */
  synthesisStartTime?: number | null
  /** ms timestamp when synthesis completed. null while running. */
  synthesisFinishedAt?: number | null
  synthesisExpectedMs?: number
  /** Running sum from completed-only models during run; full total at done. */
  totalTokens: number
  totalCost: number
  /** ms timestamp when the Apollo turn began (for footer elapsed display). */
  turnStartTime: number | null
  /** ms timestamp when the entire turn completed (for footer elapsed when done). */
  turnFinishedAt?: number | null
  /**
   * When true, panel runs an internal rAF loop (~200ms cadence) to advance
   * phase progression. When false, phases are computed once from current
   * timestamps — used by the preview page and any non-live render.
   */
  live: boolean
}

// ── Provider brand colors (mirrors src/config/providers.ts) ─────────────────
const PROVIDER_COLOR: Record<ApolloProvider, { primary: string; onAccent: string }> = {
  anthropic: { primary: '#D97757', onAccent: '#FFFFFF' },
  openai:    { primary: '#10A37F', onAccent: '#FFFFFF' },
  google:    { primary: '#4285F4', onAccent: '#FFFFFF' },
  xai:       { primary: '#A1A1AA', onAccent: '#FFFFFF' },
  deepseek:  { primary: '#4D6BFE', onAccent: '#FFFFFF' },
  mistral:   { primary: '#FA520F', onAccent: '#FFFFFF' },
  meta:      { primary: '#0064E0', onAccent: '#FFFFFF' },
  cohere:    { primary: '#FF7759', onAccent: '#FFFFFF' },
  perplexity:{ primary: '#1FB8CD', onAccent: '#0A0A0F' },
  default:   { primary: '#14B8CD', onAccent: '#0A0A0F' },
}

function providerInitial(provider: ApolloProvider): string {
  switch (provider) {
    case 'anthropic': return 'A'
    case 'openai': return 'O'
    case 'google': return 'G'
    case 'xai': return 'x'
    case 'deepseek': return 'D'
    case 'mistral': return 'M'
    case 'meta': return 'M'
    case 'cohere': return 'C'
    case 'perplexity': return 'P'
    default: return '·'
  }
}

// ── State color tokens ──────────────────────────────────────────────────────
const STATE_COLOR = {
  running:        { primary: '#f59e0b', tint: 'rgba(245,158,11,0.12)', label: 'running' },
  'cross-examining': { primary: '#7F77DD', tint: 'rgba(127,119,221,0.14)', label: 'cross-examining' },
  done:           { primary: '#1D9E75', tint: 'rgba(29,158,117,0.12)', label: 'complete' },
  error:          { primary: '#f87171', tint: 'rgba(248,113,113,0.12)', label: 'error' },
} as const

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtTokens(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`
  return `${Math.round(n / 1000)}K`
}

function fmtCost(usd: number): string {
  return `$${usd.toFixed(4)}`
}

/**
 * Compute active phase 0–4 from timestamps and current clock.
 *
 * Returns:
 *   undefined  — model hasn't started yet (startTime is null)
 *   4          — model finished (finishedAt is non-null); all phases done
 *   0–3        — quartile of elapsed/expected. Holds on 3 past expectedMs to
 *                avoid lying about progress when a model overshoots.
 *
 * `reducedMotion` collapses progression: still-running models show phase 0
 * statically; phase advancement only happens when SSE flips finishedAt.
 */
function computeActivePhase(
  startTime: number | null,
  finishedAt: number | null,
  expectedMs: number,
  now: number,
  reducedMotion: boolean,
): number | undefined {
  if (startTime === null) return undefined
  if (finishedAt !== null) return 4
  if (reducedMotion) return 0
  const elapsed = now - startTime
  const ratio = elapsed / expectedMs
  if (ratio < 0.25) return 0
  if (ratio < 0.5) return 1
  if (ratio < 0.75) return 2
  return 3
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    // Older browsers only support addListener; modern: addEventListener
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [])
  return reduced
}

/**
 * Single rAF loop per mounted panel, throttled to ~200ms. Only runs when
 * `live` is true AND prefers-reduced-motion is off. Returns the current
 * timestamp (re-rendered on each tick) for downstream phase computation.
 */
function useThrottledNow(live: boolean, reducedMotion: boolean): number {
  const [now, setNow] = useState<number>(() => Date.now())
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)

  useEffect(() => {
    if (!live || reducedMotion) return
    const TICK_MS = 200
    const loop = (timestamp: number) => {
      if (timestamp - lastTickRef.current >= TICK_MS) {
        lastTickRef.current = timestamp
        setNow(Date.now())
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [live, reducedMotion])

  return now
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface PhaseRowProps {
  label: string
  state: 'done' | 'active' | 'pending'
}

function PhaseRow({ label, state }: PhaseRowProps) {
  const iconColor = state === 'done' ? '#1D9E75' : state === 'active' ? '#f59e0b' : '#4a4f57'
  const textColor = state === 'done' ? '#6b7079' : state === 'active' ? '#f59e0b' : '#4a4f57'
  return (
    <div
      className="flex items-center gap-2 py-[3px]"
      style={{ fontSize: 11, color: textColor }}
      aria-current={state === 'active' ? 'step' : undefined}
    >
      {state === 'done' && <Check size={11} strokeWidth={3} style={{ color: iconColor }} />}
      {state === 'active' && (
        <span
          className="apollo-active-dot"
          style={{ background: iconColor }}
          aria-hidden
        />
      )}
      {state === 'pending' && <Circle size={11} strokeWidth={2} style={{ color: iconColor, opacity: 0.6 }} />}
      <span style={{ fontWeight: state === 'active' ? 500 : 400 }}>{label}</span>
    </div>
  )
}

interface ModelCardProps {
  model: ApolloPanelModel
  activePhaseIndex: number | undefined
  elapsedMs: number
  dimmed?: boolean
}

function ModelCard({ model, activePhaseIndex, elapsedMs, dimmed }: ModelCardProps) {
  const color = PROVIDER_COLOR[model.provider] || PROVIDER_COLOR.default
  const isDone = model.status === 'done'
  const isError = model.status === 'error'
  const isRunning = model.status === 'running'

  const headerTime = isError
    ? 'Failed'
    : isDone
      ? `${fmtTime(elapsedMs)} ✓`
      : isRunning
        ? `${fmtTime(elapsedMs)}…`
        : 'Queued'

  const headerTimeColor = isDone ? '#1D9E75' : isError ? '#f87171' : isRunning ? '#f59e0b' : '#6b7079'

  const iconBg = isDone ? 'rgba(29,158,117,0.18)' : isError ? 'rgba(248,113,113,0.18)' : color.primary
  const iconFg = isDone ? '#1D9E75' : isError ? '#f87171' : color.onAccent

  return (
    <div
      className="apollo-card"
      style={{
        opacity: dimmed ? 0.55 : 1,
        transition: 'opacity 200ms ease',
      }}
    >
      <div className="flex items-center gap-2.5 mb-1">
        <div
          className="apollo-card-icon"
          style={{ background: iconBg, color: iconFg }}
          aria-hidden
        >
          {isDone ? <Check size={11} strokeWidth={3} /> : isError ? '×' : <span style={{ fontSize: 10, fontWeight: 700 }}>{providerInitial(model.provider)}</span>}
        </div>
        <div className="flex-1 min-w-0 truncate" style={{ fontSize: 12, fontWeight: 500, color: '#e4e4e7' }}>
          {model.displayName}
        </div>
        <div style={{ fontSize: 10.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontVariantNumeric: 'tabular-nums', color: headerTimeColor }}>
          {headerTime}
        </div>
      </div>

      {isError ? (
        <div
          className="ml-7 mt-1 px-2 py-1.5 rounded"
          style={{ background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.22)', fontSize: 10.5, color: '#f87171', lineHeight: 1.4 }}
        >
          {model.errorMessage || 'Model failed to respond.'}
        </div>
      ) : (
        <div className="ml-7 mt-0.5" aria-live="polite">
          {MODEL_PHASES.map((phase, idx) => {
            const phaseState: 'done' | 'active' | 'pending' = isDone
              ? 'done'
              : activePhaseIndex !== undefined
                ? idx < activePhaseIndex
                  ? 'done'
                  : idx === activePhaseIndex
                    ? 'active'
                    : 'pending'
                : 'pending'
            return <PhaseRow key={phase} label={phase} state={phaseState} />
          })}
        </div>
      )}
    </div>
  )
}

interface SynthesisCardProps {
  state: 'pending' | 'running' | 'done'
  activePhaseIndex: number | undefined
  elapsedMs: number
}

function SynthesisCard({ state, activePhaseIndex, elapsedMs }: SynthesisCardProps) {
  const isDone = state === 'done'
  const isRunning = state === 'running'

  const tint = isDone ? 'rgba(29,158,117,0.08)' : 'rgba(127,119,221,0.08)'
  const border = isDone ? 'rgba(29,158,117,0.22)' : 'rgba(127,119,221,0.24)'
  const iconColor = isDone ? '#1D9E75' : '#7F77DD'
  const titleColor = isDone ? '#1D9E75' : '#a39be8'

  const title = isDone ? 'Synthesis complete' : 'Synthesis'

  return (
    <div
      className="apollo-synthesis-card"
      style={{ background: tint, borderColor: border }}
    >
      <div className="flex items-center gap-2.5 mb-1">
        <div className="apollo-card-icon" style={{ background: 'rgba(127,119,221,0.18)', color: iconColor }} aria-hidden>
          {isDone ? <Check size={11} strokeWidth={3} /> : <GitMerge size={11} />}
        </div>
        <div className="flex-1 min-w-0" style={{ fontSize: 12, fontWeight: 500, color: titleColor }}>
          {title}
        </div>
        {elapsedMs > 0 && (
          <div style={{ fontSize: 10.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontVariantNumeric: 'tabular-nums', color: iconColor }}>
            {isRunning ? `${fmtTime(elapsedMs)}…` : `${fmtTime(elapsedMs)} ✓`}
          </div>
        )}
      </div>
      <div className="ml-7 mt-0.5" aria-live="polite">
        {SYNTHESIS_PHASES.map((phase, idx) => {
          const phaseState: 'done' | 'active' | 'pending' = isDone
            ? 'done'
            : isRunning && activePhaseIndex !== undefined
              ? idx < activePhaseIndex
                ? 'done'
                : idx === activePhaseIndex
                  ? 'active'
                  : 'pending'
              : 'pending'
          return <PhaseRow key={phase} label={phase} state={phaseState} />
        })}
      </div>
    </div>
  )
}

// ── Main panel ──────────────────────────────────────────────────────────────

export function ApolloPanel(props: ApolloPanelProps) {
  const {
    state, models,
    synthesisStartTime, synthesisFinishedAt, synthesisExpectedMs = PHASE_TIMING.synthesis,
    totalTokens, totalCost,
    turnStartTime, turnFinishedAt,
    live,
  } = props

  const reducedMotion = usePrefersReducedMotion()
  // Single rAF loop per mounted panel — drives all phase progression. Static
  // when !live (preview/past-turn) or under prefers-reduced-motion.
  const now = useThrottledNow(live, reducedMotion)

  const stateColor = STATE_COLOR[state]
  const modelsDim = state === 'cross-examining' || state === 'done'
  const showSynthesis = state === 'cross-examining' || state === 'done'
  const synthesisVisualState: 'pending' | 'running' | 'done' = state === 'done' ? 'done' : 'running'

  // Per-model live elapsed + active phase (computed once per render from `now`)
  const modelRows = models.map((m) => {
    const elapsedMs = m.startTime === null
      ? 0
      : m.finishedAt !== null
        ? m.finishedAt - m.startTime
        : Math.max(0, now - m.startTime)
    const activePhaseIndex = computeActivePhase(m.startTime, m.finishedAt, m.expectedMs, now, reducedMotion)
    return { m, elapsedMs, activePhaseIndex }
  })

  // Synthesis live elapsed + phase
  const synthElapsedMs = synthesisStartTime === null || synthesisStartTime === undefined
    ? 0
    : synthesisFinishedAt !== null && synthesisFinishedAt !== undefined
      ? synthesisFinishedAt - synthesisStartTime
      : Math.max(0, now - synthesisStartTime)
  const synthActivePhase = computeActivePhase(
    synthesisStartTime ?? null,
    synthesisFinishedAt ?? null,
    synthesisExpectedMs,
    now,
    reducedMotion,
  )

  // Turn elapsed for footer
  const turnElapsedMs = turnStartTime === null
    ? 0
    : turnFinishedAt !== null && turnFinishedAt !== undefined
      ? turnFinishedAt - turnStartTime
      : Math.max(0, now - turnStartTime)

  return (
    <aside
      className="apollo-panel"
      aria-label="Apollo reasoning panel"
      role="complementary"
    >
      <style>{`
        @keyframes apollo-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.85); }
        }
        @keyframes apollo-slide-in {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .apollo-panel {
          width: 300px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: #0e1014;
          border-right: 0.5px solid rgba(255,255,255,0.08);
          color: #e4e4e7;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          height: 100%;
          min-height: 480px;
          animation: apollo-slide-in 200ms ease;
        }
        .apollo-panel-header {
          padding: 12px 14px;
          border-bottom: 0.5px solid rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .apollo-panel-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px 14px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .apollo-panel-footer {
          padding: 10px 14px;
          border-top: 0.5px solid rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10.5px;
          color: #6b7079;
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }
        .apollo-section-label {
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: #5a5f67;
          text-transform: uppercase;
          margin: 2px 0 8px;
        }
        .apollo-card {
          padding: 10px 12px;
          margin-bottom: 8px;
          border-radius: 10px;
          background: rgba(255,255,255,0.025);
          border: 0.5px solid rgba(255,255,255,0.06);
        }
        .apollo-synthesis-card {
          padding: 10px 12px;
          margin-top: 4px;
          border-radius: 10px;
          border: 0.5px solid rgba(127,119,221,0.24);
        }
        .apollo-card-icon {
          width: 20px;
          height: 20px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 11px;
          font-weight: 700;
        }
        .apollo-active-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          display: inline-block;
          animation: apollo-pulse 1.4s ease-in-out infinite;
          margin: 0 2px;
        }
        .apollo-state-pill {
          padding: 2px 8px;
          border-radius: 100px;
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.01em;
          font-variant-numeric: tabular-nums;
        }
        .apollo-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .apollo-active-dot { animation: none; }
          .apollo-panel { animation: none; }
        }
        /* Mobile stopgap (Commit 3 will replace with bottom-sheet): hide panel
           entirely <768px so phone-browser users see the old single-column
           layout (verdict + thinking indicator in main column). MobileChatPage
           (native iOS/Android shell) is a separate route — not affected. */
        @media (max-width: 767px) {
          .apollo-panel { display: none; }
        }
      `}</style>

      <header className="apollo-panel-header">
        <span
          className="apollo-status-dot"
          style={{ background: stateColor.primary, boxShadow: `0 0 6px ${stateColor.primary}` }}
          aria-hidden
        />
        <span style={{ fontSize: 13, fontWeight: 500, color: '#e4e4e7' }}>Apollo</span>
        <span
          className="apollo-state-pill"
          style={{ background: stateColor.tint, color: stateColor.primary }}
        >
          {stateColor.label}
        </span>
        <div className="flex-1" />
        <span
          style={{
            fontSize: 11,
            color: '#6b7079',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtCost(totalCost)}
        </span>
      </header>

      <div className="apollo-panel-body">
        <div className="apollo-section-label">
          <Sparkles size={9} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
          MODELS ({models.length})
        </div>
        {modelRows.map(({ m, elapsedMs, activePhaseIndex }) => (
          <ModelCard key={m.id} model={m} activePhaseIndex={activePhaseIndex} elapsedMs={elapsedMs} dimmed={modelsDim} />
        ))}

        {showSynthesis && (
          <SynthesisCard
            state={synthesisVisualState}
            activePhaseIndex={synthActivePhase}
            elapsedMs={synthElapsedMs}
          />
        )}
      </div>

      <footer className="apollo-panel-footer">
        <span>{fmtTokens(totalTokens)} tokens</span>
        <span>{fmtTime(turnElapsedMs)} elapsed</span>
      </footer>
    </aside>
  )
}
