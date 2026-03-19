import { useEffect, useRef, useState } from 'react'
import { Clock, Timer, Play, ChevronDown, Check } from 'lucide-react'
import { useModels } from '../hooks/useModels'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../hooks/useToast'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ProviderBadge } from '../components/shared/ProviderBadge'
import { LoadingPage } from '../components/shared/LoadingPage'
import { EmptyState } from '../components/shared/EmptyState'
import { formatDateTime } from '../lib/utils'
import api from '../lib/api'
import type { AIModel, HourlySession } from '../types'

// ── Fixed session pricing (integers only) ──────────────────────────────

const SESSION_PRICES: Record<string, number> = {
  // Tier 1 — Most Capable ($5/hr)
  'gpt-4o': 5,
  'claude-4-sonnet': 5,
  'claude-3-5-sonnet-20241022': 5,
  'claude-3-5-sonnet': 5,

  // Tier 2 — Balanced ($3/hr)
  'gemini-1.5-pro': 3,
  'mistral-large-latest': 3,
  'deepseek-reasoner': 3,

  // Tier 3 — Fast & Affordable ($1/hr)
  'gpt-4o-mini': 1,
  'claude-3-haiku-20240307': 1,
  'claude-3-5-haiku': 1,
  'claude-4-5-haiku': 1,
  'gemini-1.5-flash': 1,
  'gemini-2.0-flash': 1,
  'deepseek-chat': 1,
  'mistral-small-latest': 1,
  'llama-3.3-70b-versatile': 1,
  'llama-3.1-8b-instant': 1,
  'mixtral-8x7b-32768': 1,
}

const DEFAULT_PRICE = 2

const getHourlyPrice = (model: AIModel): number => {
  const byModelId = SESSION_PRICES[model.modelId?.toLowerCase()]
  if (byModelId) return byModelId

  const nameLower = model.name?.toLowerCase() ?? ''
  if (nameLower.includes('gpt-4o-mini')) return 1
  if (nameLower.includes('gpt-4o') && !nameLower.includes('mini')) return 5
  if (nameLower.includes('claude') && (nameLower.includes('sonnet') || nameLower.includes('opus'))) return 5
  if (nameLower.includes('claude') && nameLower.includes('haiku')) return 1
  if (nameLower.includes('gemini') && nameLower.includes('pro')) return 3
  if (nameLower.includes('gemini')) return 1
  if (nameLower.includes('mistral-large')) return 3
  if (nameLower.includes('mistral')) return 1
  if (nameLower.includes('deepseek-reasoner')) return 3
  if (nameLower.includes('deepseek')) return 1
  if (nameLower.includes('llama') || nameLower.includes('mixtral')) return 1

  return DEFAULT_PRICE
}

interface DurationOption {
  hours: number
  label: string
  price: number
  originalPrice: number | null
  savings: string | null
  perHour: number
}

const getDurationOptions = (hourlyPrice: number): DurationOption[] => [
  {
    hours: 1,
    label: '1 Hour',
    price: Math.max(hourlyPrice, 1),
    originalPrice: null,
    savings: null,
    perHour: hourlyPrice,
  },
  {
    hours: 3,
    label: '3 Hours',
    price: Math.max(Math.round(hourlyPrice * 3 * 0.9), 1),
    originalPrice: hourlyPrice * 3,
    savings: 'Save 10%',
    perHour: Math.max(Math.round(hourlyPrice * 0.9), 1),
  },
  {
    hours: 6,
    label: '6 Hours',
    price: Math.max(Math.round(hourlyPrice * 6 * 0.8), 1),
    originalPrice: hourlyPrice * 6,
    savings: 'Save 20%',
    perHour: Math.max(Math.round(hourlyPrice * 0.8), 1),
  },
  {
    hours: 24,
    label: '24 Hours',
    price: Math.max(Math.round(hourlyPrice * 24 * 0.67), 1),
    originalPrice: hourlyPrice * 24,
    savings: 'Save 33%',
    perHour: Math.max(Math.round(hourlyPrice * 0.67), 1),
  },
]

const formatSessionPrice = (price: number): string => `$${Math.max(Math.round(price), 1)}`

// ── Component ──────────────────────────────────────────────────────────

export function SessionsPage() {
  const { models, isLoading: modelsLoading } = useModels()
  const { refreshWallet } = useWallet()
  const toast = useToast()
  const [activeSessions, setActiveSessions] = useState<HourlySession[]>([])
  const [history, setHistory] = useState<HourlySession[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [selectedDuration, setSelectedDuration] = useState(1)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeModels = models.filter((m) => m.isActive)
  const selectedModel = activeModels.find((m) => m.id === selectedModelId)
  const hourlyPrice = selectedModel ? getHourlyPrice(selectedModel) : DEFAULT_PRICE
  const durationOptions = getDurationOptions(hourlyPrice)
  const selectedOption = durationOptions.find((d) => d.hours === selectedDuration) || durationOptions[0]

  const fetchSessions = async () => {
    try {
      const [activeRes, historyRes] = await Promise.allSettled([
        api.get('/session/active'),
        api.get('/session/history'),
      ])
      if (activeRes.status === 'fulfilled') setActiveSessions(Array.isArray(activeRes.value.data.data) ? activeRes.value.data.data : [])
      if (historyRes.status === 'fulfilled') setHistory(Array.isArray(historyRes.value.data.data) ? historyRes.value.data.data : [])
    } catch {} finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchSessions() }, [])
  useEffect(() => { if (models.length > 0 && !selectedModelId) setSelectedModelId(activeModels[0]?.id || '') }, [models])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handlePurchase = async () => {
    if (!selectedModel) {
      toast.error('Please select a model')
      return
    }
    try {
      setIsPurchasing(true)
      await api.post('/session/purchase', {
        modelId: selectedModelId,
        durationHours: selectedDuration,
        amountPaid: selectedOption.price,
      })
      toast.success(`${selectedDuration}hr session purchased!`)
      fetchSessions()
      refreshWallet()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Purchase failed'
      toast.error(msg)
    } finally {
      setIsPurchasing(false)
    }
  }

  if (isLoading || modelsLoading) return <LoadingPage />

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary">Sessions</h2>

      {/* Active Sessions */}
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-3">Active Sessions</h3>
        {activeSessions.length === 0 ? (
          <Card><p className="text-sm text-text-muted text-center py-4">No active sessions</p></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

      {/* Purchase */}
      <Card padding="lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Purchase a Session</h3>
        <div className="space-y-4">
          {/* Custom Model Dropdown */}
          <div>
            <label className="text-sm text-text-secondary mb-2 block">Select Model</label>
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full flex items-center justify-between bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 hover:border-primary/40 transition-colors"
              >
                <span>
                  {selectedModel
                    ? `${selectedModel.name} (${selectedModel.provider}) — ${formatSessionPrice(getHourlyPrice(selectedModel))}/hr`
                    : 'Select a model'}
                </span>
                <ChevronDown size={16} className={`text-text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {dropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-surface-2 border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {activeModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setSelectedModelId(m.id); setDropdownOpen(false) }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-sm text-left hover:bg-primary/10 transition-colors ${
                        m.id === selectedModelId ? 'bg-primary/5 text-primary' : 'text-text-primary'
                      }`}
                    >
                      <span>{m.name} ({m.provider})</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono text-text-muted">{formatSessionPrice(getHourlyPrice(m))}/hr</span>
                        {m.id === selectedModelId && <Check size={14} className="text-primary" />}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm text-text-secondary mb-2 block">Duration</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {durationOptions.map((d) => (
                <button
                  key={d.hours}
                  onClick={() => setSelectedDuration(d.hours)}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    selectedDuration === d.hours
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <Clock size={20} className="mx-auto mb-2 text-primary" />
                  <p className="text-sm font-semibold text-text-primary">{d.label}</p>
                  <p className="text-lg font-bold font-mono text-primary mt-1">{formatSessionPrice(d.price)}</p>
                  {d.originalPrice !== null && d.originalPrice !== d.price && (
                    <p className="text-xs font-mono text-text-muted line-through mt-0.5">{formatSessionPrice(d.originalPrice)}</p>
                  )}
                  {d.savings && <p className="text-xs text-success mt-0.5">{d.savings}</p>}
                </button>
              ))}
            </div>
          </div>

          {/* Purchase Button */}
          <div className="flex items-center gap-4 pt-2">
            <Button onClick={handlePurchase} isLoading={isPurchasing} size="lg" className="w-full sm:w-auto">
              <Play size={16} />
              Purchase {selectedDuration}hr — {formatSessionPrice(selectedOption.price)}
            </Button>
          </div>
        </div>
      </Card>

      {/* History */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Session History</h3>
        </div>
        {history.length === 0 ? (
          <EmptyState icon={<Timer size={40} />} title="No past sessions" description="Your session history will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Model</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Duration</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Cost</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Started</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.id} className="border-b border-border/50">
                    <td className="px-4 py-3 text-sm text-text-primary">{s.model?.name || 'Unknown'}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{s.durationHours}hr</td>
                    <td className="px-4 py-3 text-sm font-mono text-primary text-right">${Math.max(Math.round(Number(s.amountPaid) || 0), 1)}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{formatDateTime(s.startTime)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={s.isActive ? 'success' : s.isExpired ? 'default' : 'warning'} size="sm">
                        {s.isActive ? 'Active' : s.isExpired ? 'Expired' : 'Completed'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function SessionCard({ session }: { session: HourlySession }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const end = new Date(session.endTime).getTime()
      const now = Date.now()
      const diff = end - now
      if (diff <= 0) { setTimeLeft('Expired'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${h}h ${m}m ${s}s`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [session.endTime])

  const total = new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
  const elapsed = Date.now() - new Date(session.startTime).getTime()
  const progress = Math.min((elapsed / total) * 100, 100)

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-text-primary">{session.model?.name || 'Session'}</h4>
        {session.model?.provider && <ProviderBadge provider={session.model.provider} />}
      </div>
      <p className="text-2xl font-mono font-semibold text-primary mb-2">{timeLeft}</p>
      <ProgressBar value={progress} max={100} size="sm" />
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-text-muted">{session.durationHours}hr session</span>
        <span className="text-xs font-mono text-text-secondary">Paid: ${Math.max(Math.round(Number(session.amountPaid) || 0), 1)}</span>
      </div>
    </Card>
  )
}

export default SessionsPage;
