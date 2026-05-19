import { useMemo, useState } from 'react'
import { ApolloPanel, PHASE_TIMING, type ApolloPanelProps } from '../components/council/ApolloPanel'

type PreviewName = 'running' | 'cross-examining' | 'done' | 'error' | 'mixed-running'

// Each preview computes a fixed `now` at construction time and derives all
// timestamps relative to it. Since `live: false`, the panel does no rAF —
// these are frozen visual snapshots for review.
function buildPreviews(now: number): Record<PreviewName, ApolloPanelProps> {
  return {
    running: {
      state: 'running',
      models: [
        { id: 'm1', provider: 'anthropic', displayName: 'Claude Opus 4.7', status: 'running',
          startTime: now - 4500, finishedAt: null, expectedMs: PHASE_TIMING.claude },
        { id: 'm2', provider: 'openai', displayName: 'GPT-5.5', status: 'running',
          startTime: now - 5200, finishedAt: null, expectedMs: PHASE_TIMING.gpt },
        { id: 'm3', provider: 'google', displayName: 'Gemini 2.5 Pro', status: 'running',
          startTime: now - 16800, finishedAt: null, expectedMs: PHASE_TIMING.gemini },
      ],
      totalTokens: 0,
      totalCost: 0,
      turnStartTime: now - 16800,
      live: false,
    },
    'mixed-running': {
      state: 'running',
      models: [
        { id: 'm1', provider: 'openai', displayName: 'GPT-5.5', status: 'done',
          startTime: now - 8400, finishedAt: now - 0, expectedMs: PHASE_TIMING.gpt, tokens: 3812 },
        { id: 'm2', provider: 'anthropic', displayName: 'Claude Opus 4.7', status: 'running',
          startTime: now - 13200, finishedAt: null, expectedMs: PHASE_TIMING.claude },
        { id: 'm3', provider: 'google', displayName: 'Gemini 2.5 Pro', status: 'running',
          startTime: now - 1100, finishedAt: null, expectedMs: PHASE_TIMING.gemini },
      ],
      totalTokens: 3812,
      totalCost: 0.0098,
      turnStartTime: now - 13200,
      live: false,
    },
    'cross-examining': {
      state: 'cross-examining',
      models: [
        { id: 'm1', provider: 'anthropic', displayName: 'Claude Opus 4.7', status: 'done',
          startTime: now - 30000, finishedAt: now - 12600, expectedMs: PHASE_TIMING.claude, tokens: 4123 },
        { id: 'm2', provider: 'openai', displayName: 'GPT-5.5', status: 'done',
          startTime: now - 30000, finishedAt: now - 20200, expectedMs: PHASE_TIMING.gpt, tokens: 3812 },
        { id: 'm3', provider: 'google', displayName: 'Gemini 2.5 Pro', status: 'done',
          startTime: now - 30000, finishedAt: now - 8900, expectedMs: PHASE_TIMING.gemini, tokens: 4267 },
      ],
      synthesisStartTime: now - 5400,
      synthesisFinishedAt: null,
      synthesisExpectedMs: PHASE_TIMING.synthesis,
      totalTokens: 12202,
      totalCost: 0.0314,
      turnStartTime: now - 30000,
      live: false,
    },
    done: {
      state: 'done',
      models: [
        { id: 'm1', provider: 'anthropic', displayName: 'Claude Opus 4.7', status: 'done',
          startTime: now - 48400, finishedAt: now - 31000, expectedMs: PHASE_TIMING.claude, tokens: 4123 },
        { id: 'm2', provider: 'openai', displayName: 'GPT-5.5', status: 'done',
          startTime: now - 48400, finishedAt: now - 38600, expectedMs: PHASE_TIMING.gpt, tokens: 3812 },
        { id: 'm3', provider: 'google', displayName: 'Gemini 2.5 Pro', status: 'done',
          startTime: now - 48400, finishedAt: now - 27300, expectedMs: PHASE_TIMING.gemini, tokens: 4267 },
      ],
      synthesisStartTime: now - 27300,
      synthesisFinishedAt: now - 17600,
      synthesisExpectedMs: PHASE_TIMING.synthesis,
      totalTokens: 12202,
      totalCost: 0.0418,
      turnStartTime: now - 48400,
      turnFinishedAt: now,
      live: false,
    },
    error: {
      state: 'error',
      models: [
        { id: 'm1', provider: 'anthropic', displayName: 'Claude Opus 4.7', status: 'done',
          startTime: now - 17400, finishedAt: now, expectedMs: PHASE_TIMING.claude, tokens: 4123 },
        { id: 'm2', provider: 'openai', displayName: 'GPT-5.5', status: 'error',
          startTime: now - 3200, finishedAt: now, expectedMs: PHASE_TIMING.gpt,
          errorMessage: 'OpenAI returned 429 — rate limit' },
        { id: 'm3', provider: 'google', displayName: 'Gemini 2.5 Pro', status: 'error',
          startTime: now - 8100, finishedAt: now, expectedMs: PHASE_TIMING.gemini,
          errorMessage: 'Gemini provider timed out after 30s' },
      ],
      totalTokens: 4123,
      totalCost: 0.0102,
      turnStartTime: now - 17400,
      turnFinishedAt: now,
      live: false,
    },
  }
}

const PREVIEW_ORDER: PreviewName[] = ['running', 'mixed-running', 'cross-examining', 'done', 'error']
const PREVIEW_LABELS: Record<PreviewName, string> = {
  running: 'Running',
  'mixed-running': 'Mixed running (1 done, 1 mid, 1 just started)',
  'cross-examining': 'Cross-examining',
  done: 'Done',
  error: 'Errored (1 of 3 succeeded)',
}

export function ApolloPreviewPage() {
  const [current, setCurrent] = useState<PreviewName>('running')
  // Reseed `now` whenever the user picks a different preview so each click
  // produces a fresh frozen snapshot.
  const [seed, setSeed] = useState<number>(() => Date.now())
  const previews = useMemo(() => buildPreviews(seed), [seed])
  const data = previews[current]

  const select = (name: PreviewName) => {
    setCurrent(name)
    setSeed(Date.now())
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0b0d', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '14px 20px',
          background: '#15171b',
          borderBottom: '0.5px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 6 }}>
          ApolloPanel preview
        </span>
        {PREVIEW_ORDER.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => select(name)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              border: '0.5px solid',
              borderColor: current === name ? '#33BCC7' : 'rgba(255,255,255,0.1)',
              background: current === name ? 'rgba(51,188,199,0.12)' : 'transparent',
              color: current === name ? '#33BCC7' : '#a1a1aa',
              transition: 'all 150ms',
            }}
          >
            {PREVIEW_LABELS[name]}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: '#52525B', fontFamily: 'ui-monospace, monospace' }}>
          /apollo-preview — Commit 2 visual shell (live=false)
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <ApolloPanel {...data} />

        <main
          style={{
            flex: 1,
            background: '#0a0b0d',
            padding: '24px 32px',
            overflowY: 'auto',
            color: '#e4e4e7',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div style={{ maxWidth: 720, marginLeft: 'auto', marginRight: 'auto', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <div
                style={{
                  maxWidth: '70%',
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: 'rgba(51,188,199,0.10)',
                  border: '0.5px solid rgba(51,188,199,0.22)',
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                Compare the architectural trade-offs of monolith vs. microservices for a 50-engineer startup.
              </div>
            </div>

            {data.state === 'done' ? (
              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: 14,
                  background: 'rgba(127,119,221,0.04)',
                  border: '0.5px solid rgba(127,119,221,0.22)',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#a39be8' }}>Apollo</span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 100,
                      fontSize: 10,
                      fontWeight: 600,
                      background: 'rgba(29,158,117,0.12)',
                      color: '#1D9E75',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Cross-examined
                  </span>
                </div>
                <p style={{ margin: 0, color: '#d4d4d8' }}>
                  For a 50-engineer startup, a <strong>modular monolith</strong> is almost always the right starting point. Microservices' operational overhead — service discovery, distributed tracing, schema coordination — typically exceeds the coupling cost of a well-structured monolith until you cross ~100 engineers or have genuinely independent deploy cadences across product surfaces.
                </p>
                <div style={{ marginTop: 12, fontSize: 11, color: '#6b7079', fontFamily: 'ui-monospace, monospace' }}>
                  12.2K tokens · $0.0418 · 48.4s
                </div>
              </div>
            ) : data.state === 'error' ? (
              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: 14,
                  background: 'rgba(127,119,221,0.04)',
                  border: '0.5px solid rgba(127,119,221,0.22)',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#a39be8' }}>Apollo</span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 100,
                      fontSize: 10,
                      fontWeight: 600,
                      background: 'rgba(245,158,11,0.12)',
                      color: '#f59e0b',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    1 of 3 models
                  </span>
                </div>
                <p style={{ margin: 0, color: '#d4d4d8' }}>
                  <em style={{ color: '#a1a1aa' }}>
                    (Mock salvaged response from Claude — the other two models failed. Real verdict in production will come from the surviving model's content.)
                  </em>
                </p>
                <div style={{ marginTop: 12, fontSize: 11, color: '#6b7079', fontFamily: 'ui-monospace, monospace' }}>
                  4.1K tokens · $0.0102 · 17.4s
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.025)',
                  border: '0.5px solid rgba(255,255,255,0.06)',
                  fontSize: 13,
                  color: '#a1a1aa',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: data.state === 'cross-examining' ? '#7F77DD' : '#f59e0b',
                    boxShadow: `0 0 6px ${data.state === 'cross-examining' ? '#7F77DD' : '#f59e0b'}`,
                    animation: 'apollo-pulse 1.4s ease-in-out infinite',
                  }}
                  aria-hidden
                />
                <span>
                  {data.state === 'cross-examining'
                    ? 'Apollo is cross-examining responses…'
                    : 'Apollo is thinking…'}
                </span>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default ApolloPreviewPage
