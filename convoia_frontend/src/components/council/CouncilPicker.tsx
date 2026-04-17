import { useEffect, useMemo, useState } from 'react'
import { X, Check, Zap, Sparkles } from 'lucide-react'
import type { AIModel } from '../../types'

interface Props {
  activeModels: AIModel[]
  initialSelectedIds?: string[]
  variant?: 'sheet' | 'popover'
  onConfirm: (selectedIds: string[]) => void
  onClose: () => void
}

const ACCENT = '#F59E0B'
const ACCENT_DARK = '#D97706'

export function CouncilPicker({ activeModels, initialSelectedIds = [], variant = 'sheet', onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>(initialSelectedIds)

  const chatModels = useMemo(
    () => activeModels.filter((m) => !m.capabilities?.includes('image_generation')),
    [activeModels],
  )

  const canConfirm = selected.length >= 2 && selected.length <= 5
  const maxReached = selected.length >= 5

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const isSheet = variant === 'sheet'

  const panelStyle: React.CSSProperties = isSheet
    ? {
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1200,
        background: 'var(--color-surface, #fff)',
        borderTopLeftRadius: '20px', borderTopRightRadius: '20px',
        maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
        padding: 'calc(env(safe-area-inset-bottom, 0px) + 16px) 16px 16px',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
        animation: 'councilSheetUp 220ms ease-out',
      }
    : {
        position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 1200,
        width: 'min(440px, calc(100vw - 24px))', maxHeight: '70vh',
        background: 'var(--chat-surface, var(--color-surface, #fff))',
        border: '1px solid var(--chat-border, var(--color-border))',
        borderRadius: '14px', padding: '14px',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
        animation: 'councilPopIn 180ms ease-out',
      }

  return (
    <>
      {isSheet && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 1199,
            background: 'rgba(0,0,0,0.45)',
            animation: 'councilFadeIn 220ms ease-out',
          }}
        />
      )}
      <div style={panelStyle}>
        <style>{`
          @keyframes councilSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @keyframes councilPopIn { from { transform: translateY(-6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes councilFadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            }}>
              <Zap size={15} fill="white" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--chat-text, var(--color-text-primary))' }}>
                Select 2–5 models
              </div>
              <div style={{ fontSize: '11px', color: 'var(--chat-text-muted, var(--color-text-muted))' }}>
                {selected.length} selected {maxReached ? '· max reached' : ''}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px', borderRadius: '8px', color: 'var(--chat-text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--chat-text-secondary, var(--color-text-secondary))', marginBottom: '12px', lineHeight: 1.5 }}>
          Ask anything — {selected.length || 'N'} models answer independently, then ConvoiaAI cross-examines and synthesizes the strongest possible response.
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '8px', paddingBottom: '8px' }}>
          {chatModels.map((m) => {
            const isSelected = selected.includes(m.id)
            const disabled = !isSelected && maxReached
            return (
              <button
                key={m.id}
                onClick={() => !disabled && toggle(m.id)}
                disabled={disabled}
                style={{
                  padding: '8px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600,
                  border: isSelected ? `1.5px solid ${ACCENT}` : '1px solid var(--color-border, var(--chat-border))',
                  background: isSelected ? 'rgba(245,158,11,0.12)' : 'var(--color-surface-2, var(--chat-surface))',
                  color: isSelected ? ACCENT_DARK : 'var(--chat-text, var(--color-text-primary))',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.35 : 1,
                  whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: '5px',
                  transition: 'all 150ms',
                }}
              >
                {isSelected && <Check size={12} />}
                {m.name}
              </button>
            )
          })}
        </div>

        <div style={{
          marginTop: '10px', padding: '10px 12px', borderRadius: '10px',
          background: 'var(--color-surface-2, rgba(0,0,0,0.03))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '11px', color: 'var(--chat-text-muted, var(--color-text-muted))',
        }}>
          <span>~{Math.max(selected.length, 2) + 2} API calls ({Math.max(selected.length, 2)} models + cross-exam + verdict)</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Sparkles size={11} style={{ color: '#7C3AED' }} />
            Moderated by ConvoiaAI
          </span>
        </div>

        <button
          onClick={() => canConfirm && onConfirm(selected)}
          disabled={!canConfirm}
          style={{
            marginTop: '12px', padding: '12px', borderRadius: '12px',
            border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed',
            background: canConfirm
              ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`
              : 'var(--color-surface-2, rgba(0,0,0,0.05))',
            color: canConfirm ? 'white' : 'var(--chat-text-muted, var(--color-text-muted))',
            fontSize: '14px', fontWeight: 700,
            transition: 'opacity 150ms',
          }}
        >
          {canConfirm ? `Start council (${selected.length} models)` : 'Select at least 2 models'}
        </button>
      </div>
    </>
  )
}
