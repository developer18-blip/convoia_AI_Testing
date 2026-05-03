import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/mobile-theme.css'
import './styles/council.css'
import './styles/index.css'
import './styles/preferences.css'
import './styles/hero-plexus.css'
// Geist Sans — weights needed by the design system (400/500/600)
import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
// Geist Mono — 400/500 for mono-label / mono-value
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import App from './App.tsx'
import { AccentProvider } from './contexts/AccentContext'
import { SidebarProvider } from './contexts/SidebarContext'
import { initNativeBridge } from './lib/capacitor'
import { initStorageCache } from './lib/storage'

// Global error handler — logs full stack trace for debugging
window.addEventListener('error', (e) => {
  console.error('[GLOBAL ERROR]', e.message, '\nFile:', e.filename, '\nLine:', e.lineno, '\nCol:', e.colno)
  if (e.error?.stack) console.error('[STACK]', e.error.stack)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[UNHANDLED PROMISE]', e.reason?.message || e.reason, e.reason?.stack)
})

// Initialize secure storage cache + native plugins (no-ops on web)
initStorageCache()
initNativeBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccentProvider>
      <SidebarProvider>
        <App />
      </SidebarProvider>
    </AccentProvider>
  </StrictMode>,
)
