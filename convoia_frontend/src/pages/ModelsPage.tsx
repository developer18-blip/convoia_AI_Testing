import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Zap, Star, Crown, Search, X, Check, MessageSquare } from 'lucide-react'
import { useModels } from '../hooks/useModels'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { EmptyState } from '../components/shared/EmptyState'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { Button } from '../components/ui/Button'
import { ProviderBadge } from '../components/shared/ProviderBadge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { cn, formatNumber, getProviderColor } from '../lib/utils'
import type { AIModel } from '../types'

const providerTabs = [
  { id: 'all', label: 'All' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' },
  { id: 'deepseek', label: 'DeepSeek' },
  // TODO: Re-enable when API keys are added
  // { id: 'mistral', label: 'Mistral' },
  // { id: 'groq', label: 'Groq' },
]

function getTier(model: { name: string }): 'capable' | 'balanced' | 'value' {
  const n = model.name.toLowerCase()
  if ((n.includes('gpt-4o') && !n.includes('mini')) || (n.includes('claude') && n.includes('sonnet')) || (n.includes('gemini') && n.includes('pro'))) return 'capable'
  if (n.includes('mini') || n.includes('flash') || n.includes('haiku')) return 'balanced'
  return 'value'
}

const tierConfig = {
  capable: { icon: <Crown size={16} />, label: 'MOST CAPABLE', color: 'text-amber-400' },
  balanced: { icon: <Star size={16} />, label: 'BEST BALANCE', color: 'text-blue-400' },
  value: { icon: <Zap size={16} />, label: 'SPEED & VALUE', color: 'text-emerald-400' },
}

function ModelDrawer({ model, onClose, allModels }: { model: AIModel; onClose: () => void; allModels: AIModel[] }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [compareModelId, setCompareModelId] = useState('')
  const [costInput, setCostInput] = useState('1000')
  const compareModel = allModels.find((m) => m.id === compareModelId) || null

  const estimatedCost = (words: number) => {
    const tokens = words * 1.33
    return (tokens / 1_000_000) * model.inputTokenPrice + (tokens * 0.5 / 1_000_000) * model.outputTokenPrice
  }

  const sessionPricing = [
    { hours: 1, savings: 0 },
    { hours: 3, savings: 5 },
    { hours: 6, savings: 10 },
    { hours: 24, savings: 20 },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg sm:max-w-lg max-sm:max-w-full bg-surface border-l border-border h-full overflow-y-auto animate-in slide-in-from-right">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-8 rounded-full" style={{ backgroundColor: getProviderColor(model.provider) }} />
              <div>
                <h3 className="text-lg font-semibold text-text-primary">{model.name}</h3>
                <ProviderBadge provider={model.provider} />
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-2 rounded-lg">
              <X size={18} />
            </button>
          </div>
          <Tabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'pricing', label: 'Pricing' },
              { id: 'capabilities', label: 'Capabilities' },
              { id: 'compare', label: 'Compare' },
            ]}
            activeTab={tab}
            onChange={setTab}
          />
        </div>

        <div className="p-6 space-y-6">
          {tab === 'overview' && (
            <>
              {model.description && <p className="text-sm text-text-secondary">{model.description}</p>}

              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Best for</h4>
                <ul className="space-y-1.5 text-sm text-text-secondary">
                  <li className="flex items-center gap-2"><Check size={14} className="text-success" /> Complex reasoning and analysis</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-success" /> Code generation and review</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-success" /> Creative writing and content</li>
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Context Window</h4>
                <div className="bg-surface-2 rounded-lg p-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-primary">{formatNumber(model.contextWindow)} tokens</span>
                    <span className="text-text-muted">~{(model.contextWindow / 750).toFixed(0)} pages</span>
                  </div>
                  <ProgressBar value={Math.min((model.contextWindow / 200000) * 100, 100)} max={100} size="sm" />
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Provider</h4>
                <div className="bg-surface-2 rounded-lg p-3">
                  <p className="text-sm text-text-primary capitalize">{model.provider}</p>
                  <p className="text-xs text-text-muted mt-0.5">Model ID: {model.modelId}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => navigate('/chat')}>
                  <MessageSquare size={16} /> Start Chat
                </Button>
              </div>
            </>
          )}

          {tab === 'pricing' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-2 rounded-lg p-4">
                  <p className="text-xs text-text-muted mb-1">Input Price</p>
                  <p className="text-lg font-mono font-semibold text-text-primary">${(model.inputTokenPrice * 1_000_000).toFixed(2)}</p>
                  <p className="text-xs text-text-muted">per 1M tokens</p>
                </div>
                <div className="bg-surface-2 rounded-lg p-4">
                  <p className="text-xs text-text-muted mb-1">Output Price</p>
                  <p className="text-lg font-mono font-semibold text-text-primary">${(model.outputTokenPrice * 1_000_000).toFixed(2)}</p>
                  <p className="text-xs text-text-muted">per 1M tokens</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Cost Estimator</h4>
                <div className="bg-surface-2 rounded-lg p-4">
                  <label className="text-xs text-text-muted mb-1 block">Approximate message length (words)</label>
                  <input
                    type="number"
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <p className="mt-2 text-sm text-text-primary">
                    Estimated: <span className="font-mono text-primary">${estimatedCost(Number(costInput) || 0).toFixed(6)}</span> per query
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Pay-Per-Hour Pricing</h4>
                <div className="grid grid-cols-2 gap-2">
                  {sessionPricing.map((s) => (
                    <div key={s.hours} className="bg-surface-2 rounded-lg p-3 text-center">
                      <p className="text-sm font-semibold text-text-primary">{s.hours}hr</p>
                      <p className="text-xs font-mono text-primary mt-1">
                        ${((model.inputTokenPrice / 1000) * s.hours * (1 - s.savings / 100)).toFixed(2)}
                      </p>
                      {s.savings > 0 && <p className="text-xs text-success mt-0.5">Save {s.savings}%</p>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'capabilities' && (
            <>
              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Capabilities</h4>
                <div className="space-y-2">
                  {model.capabilities.map((cap) => (
                    <div key={cap} className="flex items-center gap-2 text-sm text-text-secondary">
                      <Check size={14} className="text-success" />
                      <span className="capitalize">{cap.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Specifications</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b border-border/30">
                    <span className="text-text-muted">Context Window</span>
                    <span className="text-text-primary font-mono">{formatNumber(model.contextWindow)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/30">
                    <span className="text-text-muted">Max Output</span>
                    <span className="text-text-primary font-mono">{formatNumber(Math.min(model.contextWindow / 4, 4096))}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-text-muted">Markup</span>
                    <span className="text-text-primary font-mono">{model.markupPercentage}%</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'compare' && (
            <>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Compare with</label>
                <select
                  value={compareModelId}
                  onChange={(e) => setCompareModelId(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="">Select a model...</option>
                  {allModels.filter((m) => m.id !== model.id && m.isActive).map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                  ))}
                </select>
              </div>

              {compareModel && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-text-muted font-medium">Feature</th>
                        <th className="text-right py-2 text-text-primary font-medium">{model.name}</th>
                        <th className="text-right py-2 text-text-primary font-medium">{compareModel.name}</th>
                      </tr>
                    </thead>
                    <tbody className="text-text-secondary">
                      {([
                        ['Provider', model.provider, compareModel.provider],
                        ['Context', formatNumber(model.contextWindow), formatNumber(compareModel.contextWindow)],
                        ['Input $/1M', `$${(model.inputTokenPrice * 1_000_000).toFixed(2)}`, `$${(compareModel.inputTokenPrice * 1_000_000).toFixed(2)}`],
                        ['Output $/1M', `$${(model.outputTokenPrice * 1_000_000).toFixed(2)}`, `$${(compareModel.outputTokenPrice * 1_000_000).toFixed(2)}`],
                        ['Capabilities', String(model.capabilities.length), String(compareModel.capabilities.length)],
                      ] as [string, string, string][]).map(([label, a, b]) => (
                        <tr key={label} className="border-b border-border/30">
                          <td className="py-2 text-text-muted">{label}</td>
                          <td className={cn('py-2 text-right font-mono', label.includes('$') && Number(a.replace('$', '')) <= Number(b.replace('$', '')) && 'text-success')}>{a}</td>
                          <td className={cn('py-2 text-right font-mono', label.includes('$') && Number(b.replace('$', '')) <= Number(a.replace('$', '')) && 'text-success')}>{b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function ModelsPage() {
  const { models, isLoading, error, refetch } = useModels()
  const navigate = useNavigate()
  const [provider, setProvider] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null)

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (models.length === 0) return <EmptyState icon={<Bot size={48} />} title="No models available" description="Models will appear here once configured." />

  const filtered = models
    .filter((m) => m.isActive)
    .filter((m) => provider === 'all' || m.provider.toLowerCase() === provider)
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase()))

  const grouped = {
    capable: filtered.filter((m) => getTier(m) === 'capable'),
    balanced: filtered.filter((m) => getTier(m) === 'balanced'),
    value: filtered.filter((m) => getTier(m) === 'value'),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-text-primary">AI Models</h2>
          <p className="text-sm text-text-muted mt-1">{models.filter((m) => m.isActive).length} models available across {providerTabs.length - 1} providers</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models..." className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      </div>

      <Tabs tabs={providerTabs} activeTab={provider} onChange={setProvider} />

      {(['capable', 'balanced', 'value'] as const).map((tier) => {
        const items = grouped[tier]
        if (items.length === 0) return null
        const cfg = tierConfig[tier]
        return (
          <div key={tier}>
            <div className={cn('flex items-center gap-2 mb-4', cfg.color)}>
              {cfg.icon}
              <span className="text-xs font-semibold tracking-wider uppercase">{cfg.label}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((model) => (
                <Card
                  key={model.id}
                  hover
                  className="relative overflow-hidden cursor-pointer"
                  style={{ borderLeftColor: getProviderColor(model.provider), borderLeftWidth: '3px' } as React.CSSProperties}
                  onClick={() => setSelectedModel(model)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-base font-semibold text-text-primary">{model.name}</h3>
                      {model.description && (
                        <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{model.description}</p>
                      )}
                    </div>
                    <ProviderBadge provider={model.provider} />
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {model.capabilities.slice(0, 3).map((cap) => (
                      <Badge key={cap} size="sm">{cap}</Badge>
                    ))}
                  </div>

                  <div className="text-xs text-text-muted mb-3">
                    Context: {formatNumber(model.contextWindow)} tokens
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <p className="text-text-muted">Input</p>
                      <p className="font-mono text-text-primary">${(model.inputTokenPrice * 1_000_000).toFixed(2)}/1M</p>
                    </div>
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <p className="text-text-muted">Output</p>
                      <p className="font-mono text-text-primary">${(model.outputTokenPrice * 1_000_000).toFixed(2)}/1M</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); navigate('/chat') }}>
                      Start Chat
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )
      })}

      {/* Detail Drawer */}
      {selectedModel && (
        <ModelDrawer
          model={selectedModel}
          onClose={() => setSelectedModel(null)}
          allModels={models}
        />
      )}
    </div>
  )
}

export default ModelsPage;
