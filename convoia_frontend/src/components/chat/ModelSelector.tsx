import type { CSSProperties } from 'react'
import { useAccent } from '../../contexts/AccentContext'
import { PROVIDER_THEMES, getProviderFromModelId } from '../../config/providers'

interface Model {
  id: string
  name: string
  displayName?: string
  pricePerMillion?: number
}

interface ModelSelectorProps {
  models: Model[]
  onSelect?: (modelId: string) => void
}

export function ModelSelector({ models, onSelect }: ModelSelectorProps) {
  const { activeModelId, setActiveModel } = useAccent()

  const handleSelect = (modelId: string) => {
    setActiveModel(modelId)
    onSelect?.(modelId)
  }

  return (
    <div className="model-selector">
      <div className="mono-label">Models</div>
      <div className="model-selector__list">
        {models.map(m => {
          const providerKey = getProviderFromModelId(m.id)
          const providerTheme = PROVIDER_THEMES[providerKey]
          const isActive = m.id === activeModelId

          return (
            <button
              key={m.id}
              onClick={() => handleSelect(m.id)}
              className={`model-item ${isActive ? 'model-item--active' : ''}`}
              style={isActive ? ({
                '--item-color': providerTheme.primary,
                '--item-soft': providerTheme.soft,
              } as CSSProperties) : undefined}
            >
              <span className="model-item__dot" style={{ background: providerTheme.primary }} />
              <span className="model-item__name mono">{m.displayName || m.name}</span>
              <span className="model-item__provider">
                {providerTheme.name.slice(0, 3).toUpperCase()}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
