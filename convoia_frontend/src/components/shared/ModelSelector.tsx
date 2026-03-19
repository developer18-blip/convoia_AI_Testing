import { useState, useRef, useEffect } from 'react'
import { Search, Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { AIModel } from '../../types'

interface ModelSelectorProps {
  models: AIModel[]
  selectedId: string
  onChange: (id: string) => void
  className?: string
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10B981',
  anthropic: '#D97706',
  google: '#4285F4',
  deepseek: '#4F46E5',
  mistral: '#6B7280',
  groq: '#6366F1',
}

function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] ?? '#6B7280'
}

export function ModelSelector({ models, selectedId, onChange, className }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = models.find((m) => m.id === selectedId)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelectModel = (id: string) => {
    onChange(id)
    setIsOpen(false)
    setSearch('')
  }

  // Group models by provider
  const providers = [...new Set(models.map((m) => m.provider))]

  const filteredModels = search
    ? models.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase()))
    : models

  const groupedFiltered = providers
    .map((provider) => ({
      provider,
      models: filteredModels.filter((m) => m.provider === provider),
    }))
    .filter((g) => g.models.length > 0)

  return (
    <div className={cn('relative', className)} ref={ref}>
      {/* Trigger — ChatGPT style: just text + chevron */}
      <button
        onClick={() => { setIsOpen(!isOpen); setSearch('') }}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
          padding: '6px 8px', borderRadius: '8px',
          fontSize: '16px', fontWeight: 600, color: '#ECECEC',
          transition: 'background-color 150ms',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2F2F2F'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        {selected?.name ?? 'Select model'}
        <ChevronDown size={16} style={{ color: '#8E8E8E' }} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 z-50" style={{
          marginTop: '4px', minWidth: '280px',
          backgroundColor: '#2F2F2F', border: '1px solid #383838',
          borderRadius: '12px', padding: '6px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {/* Search */}
          <div className="relative" style={{ marginBottom: '6px' }}>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#676767' }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              style={{
                width: '100%', padding: '8px 10px 8px 32px', backgroundColor: '#383838',
                border: '1px solid #4A4A4A', borderRadius: '8px', color: '#ECECEC',
                fontSize: '13px', outline: 'none',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#4A4A4A'}
            />
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {groupedFiltered.map((group) => (
              <div key={group.provider}>
                {/* Provider label */}
                <div style={{
                  padding: '6px 12px 2px', fontSize: '11px', color: '#8E8E8E',
                  fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {group.provider}
                </div>
                {group.models.map((model) => {
                  const isSelected = model.id === selectedId
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleSelectModel(model.id)}
                      className="w-full text-left"
                      style={{
                        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '10px',
                        border: 'none', backgroundColor: 'transparent',
                        transition: 'background-color 150ms',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#383838'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {/* Provider dot */}
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                        backgroundColor: getProviderColor(model.provider),
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', color: '#ECECEC', fontWeight: 500 }}>{model.name}</div>
                        <div style={{ fontSize: '12px', color: '#8E8E8E', marginTop: '1px' }}>
                          {(model.contextWindow / 1000).toFixed(0)}K ctx &middot; ${model.inputTokenPrice.toFixed(2)}/${model.outputTokenPrice.toFixed(2)} per 1M
                        </div>
                      </div>
                      {isSelected && <Check size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
                    </button>
                  )
                })}
              </div>
            ))}
            {groupedFiltered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '16px', fontSize: '13px', color: '#8E8E8E' }}>No models found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
