import { useState } from 'react'
import { ConvoiaMark } from '../components/brand/ConvoiaMark'
import { Button } from '../components/primitives/Button'
import { Input } from '../components/primitives/Input'
import { Card } from '../components/primitives/Card'
import { Pill } from '../components/primitives/Pill'
import { SignalLine } from '../components/primitives/SignalLine'
import { ComputationLine } from '../components/primitives/ComputationLine'
import { Metric } from '../components/primitives/Metric'
import { useAccent } from '../contexts/AccentContext'
import { PROVIDER_THEMES, getProviderFromModelId } from '../config/providers'
import type { ProviderKey } from '../config/providers'

const SAMPLE_MODEL_BY_PROVIDER: Record<ProviderKey, string> = {
  anthropic: 'claude-opus-4-6',
  openai: 'gpt-5.4',
  google: 'gemini-3.1-pro',
  xai: 'grok-4',
  deepseek: 'deepseek-chat',
  mistral: 'mistral-large-latest',
  meta: 'llama-4',
  cohere: 'command-r-plus',
  perplexity: 'sonar-large',
  default: 'convoia-default',
}

export default function DesignSystemPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const { setActiveModel, activeModelId, theme: providerTheme } = useAccent()
  const activeProviderKey = getProviderFromModelId(activeModelId)

  return (
    <div data-theme={theme} style={{ minHeight: '100vh', padding: '40px', background: 'var(--surface-0)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>

        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ConvoiaMark size={32} state="idle" />
            <div>
              <h1 className="text-h2" style={{ margin: 0 }}>Convoia Design System</h1>
              <p className="mono-label" style={{ margin: 0 }}>v0.1 · Tier 0</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant={theme === 'light' ? 'primary' : 'secondary'} size="sm" onClick={() => setTheme('light')}>Light</Button>
            <Button variant={theme === 'dark' ? 'primary' : 'secondary'} size="sm" onClick={() => setTheme('dark')}>Dark</Button>
          </div>
        </header>

        <SignalLine />

        <section>
          <div className="section-heading">Dynamic Provider Accents</div>
          <p className="text-body-sm" style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
            Click any provider — the entire UI adopts that brand color. Live preview:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
            {(Object.entries(PROVIDER_THEMES) as [ProviderKey, typeof PROVIDER_THEMES[ProviderKey]][]).map(([key, pt]) => {
              const isActive = activeProviderKey === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveModel(SAMPLE_MODEL_BY_PROVIDER[key])}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    border: `0.5px solid ${isActive ? pt.border : 'var(--border-default)'}`,
                    background: isActive ? pt.soft : 'var(--surface-1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: pt.primary }} />
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{pt.name}</div>
                  </div>
                  <div className="mono-label" style={{ fontSize: 9 }}>{pt.primary}</div>
                </button>
              )
            })}
          </div>
          <div style={{ padding: 16, border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }}>
            <div className="mono-label" style={{ marginBottom: 8 }}>CURRENT ACCENT</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)' }} />
              <div>
                <div className="text-body" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{providerTheme.name}</div>
                <div className="mono-label">{activeModelId}</div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="section-heading">Typography</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="text-display">Display 48px</div>
            <div className="text-h1">Heading 1 — 32px</div>
            <div className="text-h2">Heading 2 — 24px</div>
            <div className="text-h3">Heading 3 — 18px</div>
            <div className="text-body-lg">Body Large — 15px. Regular reading text goes here.</div>
            <div className="text-body">Body — 14px. Default text size for UI.</div>
            <div className="text-body-sm">Body Small — 13px. Secondary text.</div>
            <div className="text-caption">Caption — 12px tertiary info</div>
            <div className="mono-label">MONO LABEL · 11PX UPPERCASE</div>
            <div className="mono-value" style={{ fontSize: 18 }}>claude-opus-4.6 · 1,247 tokens · $0.0031</div>
          </div>
        </section>

        <section>
          <div className="section-heading">Accent — Turquoise</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(stop => (
              <div key={stop} style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, background: `var(--accent-${stop})`, border: '0.5px solid var(--border-default)' }} />
                <div className="mono-label" style={{ marginTop: 4, fontSize: 10 }}>{stop}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="section-heading">Convoia Mark — states</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {(['idle', 'thinking', 'streaming', 'council'] as const).map(state => (
              <Card key={state} padding="md" style={{ textAlign: 'center' }}>
                <ConvoiaMark size={48} state={state} />
                <div className="mono-label" style={{ marginTop: 8 }}>{state}</div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div className="section-heading">Buttons</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button size="sm" variant="primary">Small</Button>
            <Button size="md" variant="primary">Medium</Button>
            <Button size="lg" variant="primary">Large</Button>
          </div>
        </section>

        <section>
          <div className="section-heading">Inputs</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="Email" placeholder="you@example.com" />
            <Input label="API Key" placeholder="sk-..." mono />
            <Input label="With error" placeholder="Type here" error="This field is required" />
            <Input label="With hint" placeholder="Type here" hint="Optional helper text" />
          </div>
        </section>

        <section>
          <div className="section-heading">Pills</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Pill>Default</Pill>
            <Pill variant="accent">⚡ Council</Pill>
            <Pill variant="success">Active</Pill>
            <Pill variant="warning">Beta</Pill>
            <Pill variant="error">Error</Pill>
            <Pill mono>claude-opus-4.6</Pill>
            <Pill mono variant="accent">$0.06/query</Pill>
          </div>
        </section>

        <section>
          <div className="section-heading">Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Metric label="Tokens" value="24,300" />
            <Metric label="Cost" value="$0.06" sublabel="per query" accent />
            <Metric label="Models" value="3" sublabel="in council" />
            <Metric label="Confidence" value="92%" accent sublabel="3/3 agreed" />
          </div>
        </section>

        <section>
          <div className="section-heading">Computation Line</div>
          <Card padding="md">
            <ComputationLine label="STREAMING · 847/MAX TOKENS" />
          </Card>
        </section>

        <section>
          <div className="section-heading">Cards</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Card padding="md">
              <div className="text-body" style={{ fontWeight: 500 }}>Default card</div>
              <div className="text-caption" style={{ marginTop: 4 }}>Clean, minimal</div>
            </Card>
            <Card variant="raised" padding="md">
              <div className="text-body" style={{ fontWeight: 500 }}>Raised card</div>
              <div className="text-caption" style={{ marginTop: 4 }}>Subtle shadow</div>
            </Card>
            <Card variant="default" padding="md" accent>
              <div className="text-body" style={{ fontWeight: 500 }}>Accent card</div>
              <div className="text-caption" style={{ marginTop: 4 }}>Turquoise border</div>
            </Card>
          </div>
        </section>

        <section>
          <div className="section-heading">Grain Surface</div>
          <div className="grain-surface" style={{
            padding: 40,
            background: 'var(--surface-1)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            minHeight: 140,
          }}>
            <div className="text-body" style={{ fontWeight: 500 }}>This surface has the grain texture</div>
            <div className="text-caption" style={{ marginTop: 4 }}>
              Subtle animated noise — 8s cycle. Look closely to see the shift.
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
