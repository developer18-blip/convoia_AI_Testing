import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/mobile-theme.css'
import App from './App.tsx'
import { initNativeBridge } from './lib/capacitor'
import { initStorageCache } from './lib/storage'

// Initialize secure storage cache + native plugins (no-ops on web)
initStorageCache()
initNativeBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
