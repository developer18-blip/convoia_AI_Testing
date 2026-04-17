import { useEffect, useMemo, useState } from 'react'
import { X, Zap } from 'lucide-react'
import type { AIModel } from '../../types'
import { groupModelsByCategory, RECOMMENDED_IDS } from './councilConstants'

interface Props {
  activeModels: AIModel[]
  initialSelectedIds?: string[]
  variant?: 'sheet' | 'popover'
  onConfirm: (selectedIds: string[]) => void
  onClose: () => void
}

export function CouncilPicker({ activeModels, initialSelectedIds = [], variant = 'sheet', onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>(initialSelectedIds)

  const sections = useMemo(() => groupModelsByCategory(activeModels), [activeModels])

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
  const panelClass = isSheet ? 'council-picker-sheet' : 'council-picker-modal'

  return (
    <>
      <div className="council-picker-overlay" onClick={onClose} />
      <div className={panelClass}>
        <div className="council-picker-header">
          <div className="council-picker-icon">
            <Zap size={16} fill="white" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="council-picker-title">Select 2–5 models</div>
            <div className="council-picker-subtitle">
              {selected.length} selected{maxReached ? ' · max reached' : ''}
            </div>
          </div>
          <button className="council-picker-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="council-picker-desc">
          Ask anything — {selected.length >= 2 ? selected.length : 'multiple'} models answer independently, then ConvoiaAI cross-examines and synthesizes the strongest possible response.
        </div>

        <div className="council-picker-scroll">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="council-category-label">{section.label}</div>
              <div className="council-category-grid">
                {section.models.map((m) => {
                  const isSelected = selected.includes(m.id)
                  const isRecommended = RECOMMENDED_IDS.has(m.modelId)
                  const disabled = !isSelected && maxReached
                  const classes = [
                    'council-model-chip',
                    isSelected ? 'council-model-chip--selected' : '',
                    !isSelected && isRecommended ? 'council-model-chip--recommended' : '',
                    disabled ? 'council-model-chip--maxed' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <button
                      key={m.id}
                      className={classes}
                      onClick={() => !disabled && toggle(m.id)}
                      disabled={disabled}
                      title={isRecommended && !isSelected ? 'Recommended for Council' : undefined}
                    >
                      {m.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="council-picker-footer">
          <span>~{Math.max(selected.length, 2) + 2} API calls ({Math.max(selected.length, 2)} models + cross-exam + verdict)</span>
          <span className="council-picker-moderator">Moderated by ConvoiaAI</span>
        </div>

        <button
          className={`council-picker-confirm ${canConfirm ? 'council-picker-confirm--active' : 'council-picker-confirm--disabled'}`}
          onClick={() => canConfirm && onConfirm(selected)}
          disabled={!canConfirm}
        >
          {canConfirm ? `Start council (${selected.length} models)` : 'Select at least 2 models'}
        </button>
      </div>
    </>
  )
}
