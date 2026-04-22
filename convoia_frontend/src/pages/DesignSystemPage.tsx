import { useState } from 'react'
import { IntellectMark } from '../components/brand/IntellectMark'
import { Button } from '../components/primitives/Button'
import { Input } from '../components/primitives/Input'
import { Card } from '../components/primitives/Card'
import { Pill } from '../components/primitives/Pill'
import { SignalLine } from '../components/primitives/SignalLine'
import { ComputationLine } from '../components/primitives/ComputationLine'
import { Metric } from '../components/primitives/Metric'

export default function DesignSystemPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  return (
    <div data-theme={theme} style={{ minHeight: '100vh', padding: '40px', background: 'var(--surface-0)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>

        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <IntellectMark size={32} state="idle" />
            <div>
              <h1 className="text-h2" style={{ margin: 0 }}>Intellect Design System</h1>
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
          <h2 className="text-h3" style={{ marginBottom: 16 }}>Typography</h2>
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
          <h2 className="text-h3" style={{ marginBottom: 16 }}>Accent — Turquoise</h2>
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
          <h2 className="text-h3" style={{ marginBottom: 16 }}>Intellect Mark — states</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {(['idle', 'thinking', 'streaming', 'council'] as const).map(state => (
              <Card key={state} padding="md" style={{ textAlign: 'center' }}>
                <IntellectMark size={48} state={state} />
                <div className="mono-label" style={{ marginTop: 8 }}>{state}</div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-h3" style={{ marginBottom: 16 }}>Buttons</h2>
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
          <h2 className="text-h3" style={{ marginBottom: 16 }}>Inputs</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="Email" placeholder="you@example.com" />
            <Input label="API Key" placeholder="sk-..." mono />
            <Input label="With error" placeholder="Type here" error="This field is required" />
            <Input label="With hint" placeholder="Type here" hint="Optional helper text" />
          </div>
        </section>

        <section>
          <h2 className="text-h3" style={{ marginBottom: 16 }}>Pills</h2>
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
          <h2 className="text-h3" style={{ marginBottom: 16 }}>Metrics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Metric label="Tokens" value="24,300" />
            <Metric label="Cost" value="$0.06" sublabel="per query" accent />
            <Metric label="Models" value="3" sublabel="in council" />
            <Metric label="Confidence" value="92%" accent sublabel="3/3 agreed" />
          </div>
        </section>

        <section>
          <h2 className="text-h3" style={{ marginBottom: 16 }}>Computation Line</h2>
          <Card padding="md">
            <ComputationLine label="STREAMING · 847/MAX TOKENS" />
          </Card>
        </section>

        <section>
          <h2 className="text-h3" style={{ marginBottom: 16 }}>Cards</h2>
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
          <h2 className="text-h3" style={{ marginBottom: 16 }}>Grain Surface</h2>
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
