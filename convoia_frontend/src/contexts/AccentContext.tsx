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

  // Track the site-wide theme (light/dark). ThemeContext toggles the `.light`
  // class on <html>; marketing uses `[data-theme]`. Either flip has to re-run
  // our CSS-var writer so chat components pick up the per-mode accent shade.
  const [isLight, setIsLight] = useState(() => typeof document !== 'undefined' && (
    document.documentElement.classList.contains('light') ||
    document.documentElement.getAttribute('data-theme') === 'light'
  ))
  useEffect(() => {
    const read = () => setIsLight(
      document.documentElement.classList.contains('light') ||
      document.documentElement.getAttribute('data-theme') === 'light'
    )
    read()
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => obs.disconnect()
  }, [])

  const theme = getThemeForModel(activeModelId)
  const isCouncilMode = councilModels.length > 0

  // Write provider-scoped CSS vars on :root. tokens.css consumes these via
  // var() fallback chains inside [data-theme] rules, so a child element that
  // sets its own data-theme still picks up the right provider shade.
  //
  // We also mirror to the legacy --color-primary* tokens. The chat surface
  // still references those directly (send button, pills, links) so mirroring
  // is what lets the dynamic accent actually land in-app without rewriting
  // every chat component. Mobile theme has `!important` on its purple
  // override so it wins over the inline style — desktop/web stays dynamic.
  useEffect(() => {
    const root = document.documentElement
    // Stylesheets declare `--color-primary` with `!important` in light/mobile
    // themes, which would otherwise beat our inline styles and freeze the
    // accent. Writing with `important` priority lets the dynamic value win.
    const IMPORTANT = 'important'

    // Light mode uses the darker `primaryLight` shade for contrast on white
    // backgrounds. Dark mode uses the brighter `primary` shade. This mirrors
    // what tokens.css does for `--accent` via its [data-theme] rules.
    const legacyPrimary = isLight ? theme.primaryLight : theme.primary
    const legacyHover = isLight ? theme.primary : theme.primaryLight

    root.style.setProperty('--provider-primary', theme.primary, IMPORTANT)
    root.style.setProperty('--provider-light', theme.primaryLight, IMPORTANT)
    root.style.setProperty('--provider-hover', theme.primaryLight, IMPORTANT)
    root.style.setProperty('--provider-soft', theme.soft, IMPORTANT)
    root.style.setProperty('--provider-border', theme.border, IMPORTANT)
    root.style.setProperty('--provider-glow', theme.glow, IMPORTANT)
    root.style.setProperty('--provider-on', theme.onAccent, IMPORTANT)
    root.style.setProperty('--provider-name', `"${theme.name}"`, IMPORTANT)

    root.style.setProperty('--color-primary', legacyPrimary, IMPORTANT)
    root.style.setProperty('--color-primary-hover', legacyHover, IMPORTANT)
    root.style.setProperty('--color-primary-light', theme.soft, IMPORTANT)
    root.style.setProperty('--color-primary-glow', theme.glow, IMPORTANT)
  }, [theme, isLight])

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

  // Expose the useState dispatchers directly so their references stay
  // stable across renders. Consumers put these in useEffect deps, and
  // wrapping them in fresh closures every render triggered a render loop
  // (effect → setState → new closure → effect re-fires).
  return (
    <AccentContext.Provider value={{
      activeModelId,
      theme,
      setActiveModel: setActiveModelIdState,
      setCouncilModels: setCouncilModelsState,
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
