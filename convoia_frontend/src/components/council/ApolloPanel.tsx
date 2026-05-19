import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Circle, Copy, GitMerge, Sparkles, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

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
  /** Full model response text (markdown). Present only after the turn completes
   *  and the council_responses SSE event has populated it. Drives the per-model
   *  "View response" drill-down. */
  response?: string
}

export type ApolloPanelState = 'running' | 'cross-examining' | 'done' | 'error'

export interface ApolloPanelProps {
  state: ApolloPanelState
  models: ApolloPanelModel[]
  synthesisStartTime?: number | null
  synthesisFinishedAt?: number | null
  synthesisExpectedMs?: number
  totalTokens: number
  totalCost: number
  turnStartTime: number | null
  turnFinishedAt?: number | null
  /** rAF loop runs only when live && !prefers-reduced-motion. */
  live: boolean
  /** Dismiss the panel (X button). When omitted, the close button is hidden. */
  onClose?: () => void
}

// ── Provider brand colors (mirrors src/config/providers.ts) ─────────────────
const PROVIDER_COLOR: Record<ApolloProvider, { primary: string; onAccent: string; soft: string }> = {
  anthropic: { primary: '#D97757', onAccent: '#FFFFFF', soft: 'rgba(217,119,87,0.08)' },
  openai:    { primary: '#10A37F', onAccent: '#FFFFFF', soft: 'rgba(16,163,127,0.08)' },
  google:    { primary: '#4285F4', onAccent: '#FFFFFF', soft: 'rgba(66,133,244,0.08)' },
  xai:       { primary: '#A1A1AA', onAccent: '#FFFFFF', soft: 'rgba(161,161,170,0.10)' },
  deepseek:  { primary: '#4D6BFE', onAccent: '#FFFFFF', soft: 'rgba(77,107,254,0.08)' },
  mistral:   { primary: '#FA520F', onAccent: '#FFFFFF', soft: 'rgba(250,82,15,0.08)' },
  meta:      { primary: '#0064E0', onAccent: '#FFFFFF', soft: 'rgba(0,100,224,0.08)' },
  cohere:    { primary: '#FF7759', onAccent: '#FFFFFF', soft: 'rgba(255,119,89,0.08)' },
  perplexity:{ primary: '#1FB8CD', onAccent: '#0A0A0F', soft: 'rgba(31,184,205,0.08)' },
  default:   { primary: '#14B8CD', onAccent: '#0A0A0F', soft: 'rgba(20,184,205,0.08)' },
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
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [])
  return reduced
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(max-width: 767px)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [])
  return mobile
}

/** Single rAF loop per mounted panel, throttled to ~200ms. */
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
      {state === 'active' && <span className="apollo-active-dot" style={{ background: iconColor }} aria-hidden />}
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
  /** Show the per-model response drill-down (only after the turn completes). */
  showResponse: boolean
}

function ModelCard({ model, activePhaseIndex, elapsedMs, dimmed, showResponse }: ModelCardProps) {
  const [responseOpen, setResponseOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const color = PROVIDER_COLOR[model.provider] || PROVIDER_COLOR.default

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!model.response) return
    navigator.clipboard?.writeText(model.response).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
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

  const hasResponse = showResponse && !!model.response && model.response.trim().length > 0

  return (
    <div className="apollo-card" style={{ opacity: dimmed ? 0.55 : 1, transition: 'opacity 200ms ease' }}>
      <div className="flex items-center gap-2.5 mb-1">
        <div className="apollo-card-icon" style={{ background: iconBg, color: iconFg }} aria-hidden>
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
                ? idx < activePhaseIndex ? 'done' : idx === activePhaseIndex ? 'active' : 'pending'
                : 'pending'
            return <PhaseRow key={phase} label={phase} state={phaseState} />
          })}
        </div>
      )}

      {hasResponse && (
        <div className="ml-7 mt-2">
          <button
            type="button"
            onClick={() => setResponseOpen((v) => !v)}
            aria-expanded={responseOpen}
            className="apollo-response-toggle"
            style={{ ['--accent' as string]: color.primary } as React.CSSProperties}
          >
            <ChevronDown
              size={13}
              style={{ transition: 'transform 200ms ease', transform: responseOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: color.primary, flexShrink: 0 }}
            />
            <span>{responseOpen ? 'Hide answer' : 'Read full answer'}</span>
            {model.tokens ? <span className="apollo-response-tok">{fmtTokens(model.tokens)} tok</span> : null}
          </button>
          {responseOpen && (
            <div
              className="apollo-response-card"
              style={{ ['--accent' as string]: color.primary, ['--accent-bg' as string]: color.soft } as React.CSSProperties}
            >
              <div className="apollo-response-card-head">
                <div
                  className="apollo-card-icon"
                  style={{ width: 16, height: 16, borderRadius: 5, background: color.primary, color: color.onAccent, fontSize: 9 }}
                  aria-hidden
                >
                  {providerInitial(model.provider)}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#e4e4e7', flex: 1, minWidth: 0 }} className="truncate">
                  {model.displayName}
                </span>
                <button type="button" className="apollo-copy-btn" onClick={handleCopy} title={copied ? 'Copied' : 'Copy answer'} aria-label="Copy answer">
                  {copied ? <Check size={12} style={{ color: '#1D9E75' }} /> : <Copy size={12} />}
                </button>
              </div>
              <div className="apollo-response-card-body">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{model.response!}</ReactMarkdown>
              </div>
            </div>
          )}
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
    <div className="apollo-synthesis-card" style={{ background: tint, borderColor: border }}>
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
              ? idx < activePhaseIndex ? 'done' : idx === activePhaseIndex ? 'active' : 'pending'
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
    live, onClose,
  } = props

  const reducedMotion = usePrefersReducedMotion()
  const isMobile = useIsMobile()
  const now = useThrottledNow(live, reducedMotion)
  // Mobile bottom-sheet expand state. Auto-expand once the turn completes so the
  // user sees the result + response drill-downs without an extra tap.
  const [mobileExpanded, setMobileExpanded] = useState(false)
  useEffect(() => {
    if (isMobile && state === 'done') setMobileExpanded(true)
  }, [isMobile, state])

  const stateColor = STATE_COLOR[state]
  const modelsDim = state === 'cross-examining' || state === 'done'
  const showSynthesis = state === 'cross-examining' || state === 'done'
  const synthesisVisualState: 'pending' | 'running' | 'done' = state === 'done' ? 'done' : 'running'
  const showResponses = state === 'done'

  const modelRows = models.map((m) => {
    const elapsedMs = m.startTime === null
      ? 0
      : m.finishedAt !== null
        ? m.finishedAt - m.startTime
        : Math.max(0, now - m.startTime)
    const activePhaseIndex = computeActivePhase(m.startTime, m.finishedAt, m.expectedMs, now, reducedMotion)
    return { m, elapsedMs, activePhaseIndex }
  })

  const synthElapsedMs = synthesisStartTime == null
    ? 0
    : synthesisFinishedAt != null
      ? synthesisFinishedAt - synthesisStartTime
      : Math.max(0, now - synthesisStartTime)
  const synthActivePhase = computeActivePhase(synthesisStartTime ?? null, synthesisFinishedAt ?? null, synthesisExpectedMs, now, reducedMotion)

  const turnElapsedMs = turnStartTime === null
    ? 0
    : turnFinishedAt != null
      ? turnFinishedAt - turnStartTime
      : Math.max(0, now - turnStartTime)

  const panelClass = [
    'apollo-panel',
    isMobile ? (mobileExpanded ? 'apollo-panel--expanded' : 'apollo-panel--collapsed') : '',
  ].filter(Boolean).join(' ')

  const onHeaderClick = () => { if (isMobile) setMobileExpanded((v) => !v) }

  return (
    <aside className={panelClass} aria-label="Apollo reasoning panel" role="complementary">
      <style>{`
        @keyframes apollo-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.85); }
        }
        @keyframes apollo-slide-in {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        /* Desktop: right-docked, responsive width. */
        .apollo-panel {
          width: clamp(360px, 32vw, 460px);
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: #0e1014;
          border-left: 0.5px solid rgba(255,255,255,0.08);
          color: #e4e4e7;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          height: 100%;
          min-height: 0;
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
          width: 20px; height: 20px;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; font-size: 11px; font-weight: 700;
        }
        .apollo-active-dot {
          width: 7px; height: 7px;
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
          width: 8px; height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .apollo-close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px; height: 24px;
          border-radius: 6px;
          background: transparent;
          border: none;
          color: #6b7079;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 150ms, color 150ms;
        }
        .apollo-close-btn:hover { background: rgba(255,255,255,0.08); color: #e4e4e7; }
        .apollo-response-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          padding: 6px 10px;
          background: rgba(255,255,255,0.03);
          border: 0.5px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 500;
          color: #b4b8c0;
          transition: background 150ms, border-color 150ms, color 150ms;
        }
        .apollo-response-toggle:hover {
          background: color-mix(in srgb, var(--accent) 10%, transparent);
          border-color: color-mix(in srgb, var(--accent) 35%, transparent);
          color: #e8eaee;
        }
        .apollo-response-tok {
          margin-left: auto;
          font-variant-numeric: tabular-nums;
          font-size: 10px;
          color: #52525b;
          flex-shrink: 0;
        }
        @keyframes apollo-response-reveal {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .apollo-response-card {
          margin-top: 8px;
          border-radius: 10px;
          border: 0.5px solid color-mix(in srgb, var(--accent) 30%, transparent);
          border-left: 2.5px solid var(--accent);
          background: var(--accent-bg);
          overflow: hidden;
          animation: apollo-response-reveal 200ms ease;
        }
        .apollo-response-card-head {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px 10px;
          border-bottom: 0.5px solid rgba(255,255,255,0.07);
        }
        .apollo-copy-btn {
          display: flex; align-items: center; justify-content: center;
          width: 22px; height: 22px;
          border-radius: 6px;
          background: transparent;
          border: none;
          color: #6b7079;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 150ms, color 150ms;
        }
        .apollo-copy-btn:hover { background: rgba(255,255,255,0.08); color: #e4e4e7; }
        .apollo-response-card-body {
          padding: 10px 12px;
          font-size: 12px;
          line-height: 1.6;
          color: #c8ccd4;
          max-height: 380px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.12) transparent;
        }
        .apollo-response-card-body p { margin: 0 0 8px; }
        .apollo-response-card-body p:last-child { margin-bottom: 0; }
        .apollo-response-card-body strong { color: #e4e4e7; font-weight: 600; }
        .apollo-response-card-body h1, .apollo-response-card-body h2, .apollo-response-card-body h3 {
          font-size: 12.5px; font-weight: 600; color: #e8eaee; margin: 10px 0 5px;
        }
        .apollo-response-card-body code {
          background: rgba(255,255,255,0.07);
          padding: 1px 4px; border-radius: 4px;
          font-size: 11px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .apollo-response-card-body pre {
          background: rgba(0,0,0,0.32);
          padding: 9px 10px; border-radius: 7px;
          overflow-x: auto; margin: 7px 0;
        }
        .apollo-response-card-body pre code { background: transparent; padding: 0; }
        .apollo-response-card-body ul, .apollo-response-card-body ol { margin: 5px 0; padding-left: 18px; }
        .apollo-response-card-body li { margin: 2px 0; }
        .apollo-response-card-body a { color: var(--accent); text-decoration: underline; }
        .apollo-mobile-grabber { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .apollo-active-dot { animation: none; }
          .apollo-panel { animation: none; }
        }
        /* Mobile: bottom sheet. Collapsed = header bar only; expanded = up to 78vh. */
        @media (max-width: 767px) {
          .apollo-panel {
            position: fixed;
            left: 0; right: 0; bottom: 0;
            width: 100%;
            height: auto;
            border-left: none;
            border-top: 0.5px solid rgba(255,255,255,0.1);
            border-radius: 16px 16px 0 0;
            box-shadow: 0 -8px 32px rgba(0,0,0,0.45);
            z-index: 50;
            animation: none;
          }
          .apollo-panel-header { cursor: pointer; position: relative; padding-top: 16px; }
          .apollo-mobile-grabber {
            display: block;
            position: absolute;
            top: 6px; left: 50%;
            transform: translateX(-50%);
            width: 32px; height: 4px;
            border-radius: 2px;
            background: rgba(255,255,255,0.2);
          }
          .apollo-panel--collapsed .apollo-panel-body,
          .apollo-panel--collapsed .apollo-panel-footer { display: none; }
          .apollo-panel--expanded .apollo-panel-body { max-height: 70vh; }
        }
      `}</style>

      <header className="apollo-panel-header" onClick={onHeaderClick}>
        <span className="apollo-mobile-grabber" aria-hidden />
        <span className="apollo-status-dot" style={{ background: stateColor.primary, boxShadow: `0 0 6px ${stateColor.primary}` }} aria-hidden />
        <span style={{ fontSize: 13, fontWeight: 500, color: '#e4e4e7' }}>Apollo</span>
        <span className="apollo-state-pill" style={{ background: stateColor.tint, color: stateColor.primary }}>
          {stateColor.label}
        </span>
        <div className="flex-1" />
        <span style={{ fontSize: 11, color: '#6b7079', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontVariantNumeric: 'tabular-nums' }}>
          {fmtCost(totalCost)}
        </span>
        {isMobile && (
          <ChevronDown
            size={16}
            style={{ color: '#6b7079', transition: 'transform 200ms ease', transform: mobileExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-hidden
          />
        )}
        {onClose && (
          <button
            type="button"
            className="apollo-close-btn"
            aria-label="Close Apollo panel"
            title="Close panel"
            onClick={(e) => { e.stopPropagation(); onClose() }}
          >
            <X size={14} />
          </button>
        )}
      </header>

      <div className="apollo-panel-body">
        <div className="apollo-section-label">
          <Sparkles size={9} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
          MODELS ({models.length})
        </div>
        {modelRows.map(({ m, elapsedMs, activePhaseIndex }) => (
          <ModelCard key={m.id} model={m} activePhaseIndex={activePhaseIndex} elapsedMs={elapsedMs} dimmed={modelsDim} showResponse={showResponses} />
        ))}

        {showSynthesis && (
          <SynthesisCard state={synthesisVisualState} activePhaseIndex={synthActivePhase} elapsedMs={synthElapsedMs} />
        )}
      </div>

      <footer className="apollo-panel-footer">
        <span>{fmtTokens(totalTokens)} tokens</span>
        <span>{fmtTime(turnElapsedMs)} elapsed</span>
      </footer>
    </aside>
  )
}
