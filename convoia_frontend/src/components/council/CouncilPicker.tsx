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

const ACCENT = '#F59E0B'        // Council brand (amber)
const ACCENT_DARK = '#D97706'
const SELECT = '#7C3AED'         // Selected chip (purple)
const SELECT_BG = 'rgba(124,58,237,0.12)'

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
        boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
        animation: 'councilSheetUp 220ms ease-out',
        overflow: 'hidden',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }
    : {
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(540px, calc(100vw - 32px))',
        maxHeight: 'min(85vh, 720px)',
        zIndex: 1200,
        background: 'var(--chat-surface, var(--color-surface, #fff))',
        border: '1px solid var(--chat-border, var(--color-border))',
        borderRadius: '16px',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        animation: 'councilModalIn 180ms ease-out',
        overflow: 'hidden',
      }

  return (
    <>
      <style>{`
        @keyframes councilSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes councilModalIn { from { transform: translate(-50%, -50%) scale(0.95); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
        @keyframes councilFadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* Backdrop (both variants) */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1199,
          background: 'rgba(0,0,0,0.55)',
          animation: 'councilFadeIn 220ms ease-out',
          backdropFilter: 'blur(2px)',
        }}
      />

      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          padding: '14px 18px 12px',
          borderBottom: '1px solid var(--color-border, var(--chat-border))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '9px', flexShrink: 0,
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            }}>
              <Zap size={15} fill="white" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--chat-text, var(--color-text-primary))' }}>
                Select 2–5 models
              </div>
              <div style={{ fontSize: '11px', color: 'var(--chat-text-muted, var(--color-text-muted))', marginTop: '1px' }}>
                {selected.length} selected{maxReached ? ' · max reached' : ''}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: '6px', borderRadius: '8px',
              color: 'var(--chat-text-muted, var(--color-text-muted))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Description */}
        <div style={{
          padding: '12px 18px 0',
          fontSize: '12px',
          color: 'var(--chat-text-secondary, var(--color-text-secondary))',
          lineHeight: 1.5,
          flexShrink: 0,
        }}>
          Ask anything — {selected.length >= 2 ? selected.length : 'N'} models answer independently, then ConvoiaAI cross-examines and synthesizes the strongest possible response.
        </div>

        {/* Scrollable chip grid */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 18px',
          minHeight: 0,
        }}>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '8px',
          }}>
            {chatModels.map((m) => {
              const isSelected = selected.includes(m.id)
              const disabled = !isSelected && maxReached
              return (
                <button
                  key={m.id}
                  onClick={() => !disabled && toggle(m.id)}
                  disabled={disabled}
                  style={{
                    minWidth: 'fit-content',
                    padding: '8px 14px',
                    borderRadius: '100px',
                    fontSize: '12px', fontWeight: 600,
                    border: isSelected ? `1.5px solid ${SELECT}` : '1px solid var(--color-border, var(--chat-border))',
                    background: isSelected ? SELECT_BG : 'var(--color-surface-2, var(--chat-surface, #fff))',
                    color: isSelected ? SELECT : 'var(--chat-text, var(--color-text-primary))',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.35 : 1,
                    whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    transition: 'all 150ms ease',
                  }}
                >
                  {isSelected && <Check size={13} strokeWidth={3} style={{ color: SELECT, flexShrink: 0 }} />}
                  <span>{m.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Info row */}
        <div style={{
          padding: '10px 18px',
          background: 'var(--color-surface-2, rgba(0,0,0,0.03))',
          borderTop: '1px solid var(--color-border, var(--chat-border))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--chat-text-muted, var(--color-text-muted))',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <span>~{Math.max(selected.length, 2) + 2} API calls ({Math.max(selected.length, 2)} models + cross-exam + verdict)</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            <Sparkles size={11} style={{ color: SELECT }} />
            Moderated by ConvoiaAI
          </span>
        </div>

        {/* Confirm button */}
        <div style={{ padding: '12px 18px 16px', flexShrink: 0 }}>
          <button
            onClick={() => canConfirm && onConfirm(selected)}
            disabled={!canConfirm}
            style={{
              width: '100%',
              padding: '13px 16px',
              borderRadius: '12px',
              border: 'none',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              background: canConfirm
                ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`
                : 'var(--color-surface-2, rgba(0,0,0,0.05))',
              color: canConfirm ? 'white' : 'var(--chat-text-muted, var(--color-text-muted))',
              fontSize: '14px', fontWeight: 700,
              transition: 'opacity 150ms',
              boxShadow: canConfirm ? '0 4px 12px rgba(245,158,11,0.35)' : 'none',
            }}
          >
            {canConfirm ? `Start council (${selected.length} models)` : 'Select at least 2 models'}
          </button>
        </div>
      </div>
    </>
  )
}
