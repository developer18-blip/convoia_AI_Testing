import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getThemeForModel, PROVIDER_THEMES, getProviderFromModelId } from '../config/providers'
import type { ProviderTheme } from '../config/providers'

interface AccentContextValue {
  activeModelId: string
  theme: ProviderTheme
  setActiveModel: (modelId: string) => void
  /** For Council mode — blend multiple provider themes */
  setCouncilModels: (modelIds: string[]) => void
  isCouncilMode: boolean
  councilModels: string[]
}

const AccentContext = createContext<AccentContextValue | null>(null)

export function AccentProvider({ children }: { children: ReactNode }) {
  const [activeModelId, setActiveModelIdState] = useState<string>('claude-opus-4-6')
  const [councilModels, setCouncilModelsState] = useState<string[]>([])

  const theme = getThemeForModel(activeModelId)
  const isCouncilMode = councilModels.length > 0

  // Write provider-scoped CSS vars on :root. tokens.css consumes these via
  // var() fallback chains inside [data-theme] rules, so a child element that
  // sets its own data-theme still picks up the right provider shade.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--provider-primary', theme.primary)
    root.style.setProperty('--provider-light', theme.primaryLight)
    root.style.setProperty('--provider-hover', theme.primaryLight)
    root.style.setProperty('--provider-soft', theme.soft)
    root.style.setProperty('--provider-border', theme.border)
    root.style.setProperty('--provider-glow', theme.glow)
    root.style.setProperty('--provider-on', theme.onAccent)
    root.style.setProperty('--provider-name', `"${theme.name}"`)
  }, [theme])

  // Council mode — expose up to 3 provider colors so signal/compute lines can
  // render a gradient across them.
  useEffect(() => {
    const root = document.documentElement
    if (!isCouncilMode) {
      for (let i = 1; i <= 3; i++) root.style.removeProperty(`--council-color-${i}`)
      return
    }
    councilModels.slice(0, 3).forEach((modelId, i) => {
      const t = PROVIDER_THEMES[getProviderFromModelId(modelId)]
      root.style.setProperty(`--council-color-${i + 1}`, t.primary)
    })
  }, [isCouncilMode, councilModels])

  const setActiveModel = (modelId: string) => setActiveModelIdState(modelId)
  const setCouncilModels = (modelIds: string[]) => setCouncilModelsState(modelIds)

  return (
    <AccentContext.Provider value={{
      activeModelId,
      theme,
      setActiveModel,
      setCouncilModels,
      isCouncilMode,
      councilModels,
    }}>
      {children}
    </AccentContext.Provider>
  )
}

export function useAccent() {
  const ctx = useContext(AccentContext)
  if (!ctx) throw new Error('useAccent must be used inside AccentProvider')
  return ctx
}
