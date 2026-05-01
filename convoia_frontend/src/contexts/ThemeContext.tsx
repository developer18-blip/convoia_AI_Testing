import { createContext, useEffect, useState, type ReactNode } from 'react'
import { setStatusBarTheme } from '../lib/capacitor'

export type Theme = 'dark' | 'light' | 'system'
type ResolvedTheme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
})

const SETTINGS_KEY = 'convoia_settings_theme'
// TODO(settings): remove legacy convoia_theme migration shim after launch + 30 days
const LEGACY_KEYS = ['convoia_theme', 'convoia-theme']

function loadInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
    for (const k of LEGACY_KEYS) {
      const legacy = localStorage.getItem(k)
      if (legacy === 'light' || legacy === 'dark') {
        try { localStorage.setItem(SETTINGS_KEY, legacy) } catch { /* ignore */ }
        return legacy
      }
    }
  } catch { /* ignore */ }
  return 'system'
}

function resolveTheme(t: Theme): ResolvedTheme {
  if (t === 'system') {
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return t
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(loadInitialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(loadInitialTheme()))

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(resolvedTheme)
    root.setAttribute('data-theme', resolvedTheme)
    root.style.colorScheme = resolvedTheme
    try { localStorage.setItem(SETTINGS_KEY, theme) } catch { /* ignore */ }
    setStatusBarTheme(resolvedTheme === 'dark')
  }, [theme, resolvedTheme])

  useEffect(() => {
    setResolvedTheme(resolveTheme(theme))
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setResolvedTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)
  const toggleTheme = () => setThemeState((t) => {
    if (t === 'dark') return 'light'
    if (t === 'light') return 'dark'
    return resolvedTheme === 'dark' ? 'light' : 'dark'
  })

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
