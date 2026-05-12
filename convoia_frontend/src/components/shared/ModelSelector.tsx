import { useState, useRef, useEffect } from 'react'
import { Search, Check, ChevronDown, ImageIcon, Sparkles } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { AIModel } from '../../types'

const AUTO_GREEN = '#10B981'

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

const IMAGE_CAPABILITIES = ['image_generation']
function isImageModel(model: AIModel): boolean {
  return model.capabilities?.some((c: string) => IMAGE_CAPABILITIES.includes(c)) ?? false
}

export function ModelSelector({ models, selectedId, onChange, className }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const isAuto = selectedId === 'auto'
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

  // Split into chat and image models
  const chatModels = models.filter((m) => !isImageModel(m))
  const imageModels = models.filter((m) => isImageModel(m))

  // Group chat models by provider
  const chatProviders = [...new Set(chatModels.map((m) => m.provider))]

  const filteredChat = search
    ? chatModels.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase()))
    : chatModels

  const filteredImage = search
    ? imageModels.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase()))
    : imageModels

  const groupedChat = chatProviders
    .map((provider) => ({
      provider,
      models: filteredChat.filter((m) => m.provider === provider),
    }))
    .filter((g) => g.models.length > 0)

  return (
    <div className={cn('relative', className)} ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => { setIsOpen(!isOpen); setSearch('') }}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
          padding: '6px 8px', borderRadius: '8px',
          fontSize: '14px', fontWeight: 600, color: 'var(--chat-text)',
          transition: 'background-color 150ms',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chat-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        {isAuto && <Sparkles size={14} style={{ color: AUTO_GREEN }} />}
        {!isAuto && selected && isImageModel(selected) && (
          <ImageIcon size={14} style={{ color: '#F59E0B' }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(180px, 35vw)', color: isAuto ? AUTO_GREEN : undefined, fontWeight: isAuto ? 700 : 600 }}>
          {isAuto ? 'Auto' : (selected?.name ?? 'Select model')}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--chat-text-muted)', flexShrink: 0 }} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 z-50" style={{
          marginTop: '4px', minWidth: '0', width: 'min(320px, calc(100vw - 24px))',
          backgroundColor: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
          borderRadius: '12px', padding: '6px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          maxHeight: '70vh', overflowY: 'auto',
        }}>
          {/* Search */}
          <div className="relative" style={{ marginBottom: '6px' }}>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--chat-text-dim)' }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              style={{
                width: '100%', padding: '8px 10px 8px 32px', backgroundColor: 'var(--chat-hover)',
                border: '1px solid var(--chat-border)', borderRadius: '8px', color: 'var(--chat-text)',
                fontSize: '13px', outline: 'none',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--chat-border)'}
            />
          </div>

          <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
            {/* ─── Auto (LLM Router) — always first ─── */}
            {!search && (
              <button
                onClick={() => handleSelectModel('auto')}
                className="w-full text-left"
                style={{
                  padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  border: 'none',
                  background: isAuto ? `${AUTO_GREEN}15` : 'transparent',
                  transition: 'background-color 150ms', marginBottom: '4px',
                }}
                onMouseEnter={(e) => { if (!isAuto) e.currentTarget.style.backgroundColor = 'var(--chat-hover)' }}
                onMouseLeave={(e) => { if (!isAuto) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <Sparkles size={14} style={{ color: AUTO_GREEN, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', color: AUTO_GREEN, fontWeight: 700 }}>Auto</div>
                  <div style={{ fontSize: '12px', color: 'var(--chat-text-muted)', marginTop: '1px' }}>
                    Smart routing · picks the best model per query
                  </div>
                </div>
                {isAuto && <Check size={16} style={{ color: AUTO_GREEN, flexShrink: 0 }} />}
              </button>
            )}

            {/* ─── Chat Models ─── */}
            {groupedChat.map((group) => (
              <div key={group.provider}>
                <div style={{
                  padding: '6px 12px 2px', fontSize: '11px', color: 'var(--chat-text-muted)',
                  fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {group.provider}
                </div>
                {group.models.map((model) => (
                  <ModelOption
                    key={model.id}
                    model={model}
                    isSelected={model.id === selectedId}
                    onSelect={handleSelectModel}
                  />
                ))}
              </div>
            ))}

            {/* ─── Image Generation Models ─── */}
            {filteredImage.length > 0 && (
              <>
                <div style={{
                  borderTop: '1px solid var(--chat-border)', margin: '6px 0',
                }} />
                <div style={{
                  padding: '6px 12px 2px', fontSize: '11px', color: '#F59E0B',
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  <ImageIcon size={10} />
                  Image Generation
                </div>
                {filteredImage.map((model) => (
                  <ModelOption
                    key={model.id}
                    model={model}
                    isSelected={model.id === selectedId}
                    onSelect={handleSelectModel}
                    isImage
                  />
                ))}
              </>
            )}

            {groupedChat.length === 0 && filteredImage.length === 0 && (
              <div style={{ textAlign: 'center', padding: '16px', fontSize: '13px', color: 'var(--chat-text-muted)' }}>No models found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModelOption({ model, isSelected, onSelect, isImage }: {
  model: AIModel
  isSelected: boolean
  onSelect: (id: string) => void
  isImage?: boolean
}) {
  return (
    <button
      onClick={() => onSelect(model.id)}
      className="w-full text-left"
      style={{
        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '10px',
        border: 'none', backgroundColor: 'transparent',
        transition: 'background-color 150ms',
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chat-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      {/* Provider dot */}
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
        backgroundColor: getProviderColor(model.provider),
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px', color: 'var(--chat-text)', fontWeight: 500 }}>{model.name}</span>
          {isImage && (
            <span style={{
              fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px',
              backgroundColor: '#F59E0B20', color: '#F59E0B', textTransform: 'uppercase',
            }}>
              IMG
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--chat-text-muted)', marginTop: '1px' }}>
          {isImage
            ? model.description
            : `${(model.contextWindow / 1000).toFixed(0)}K ctx \u00B7 $${(model.inputTokenPrice * 1_000_000).toFixed(2)}/$${(model.outputTokenPrice * 1_000_000).toFixed(2)} per 1M`
          }
        </div>
      </div>
      {isSelected && <Check size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
    </button>
  )
}
