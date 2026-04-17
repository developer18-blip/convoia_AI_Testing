import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/mobile-theme.css'
import './styles/council.css'
import App from './App.tsx'
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
    <App />
  </StrictMode>,
)
