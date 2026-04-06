/**
 * Capacitor Native Bridge
 * Initializes native plugins when running inside a Capacitor shell (Android/iOS).
 * Uses fully dynamic imports that the bundler cannot statically analyze,
 * so the app builds on servers that don't have Capacitor packages installed.
 */

/** Detect native platform via window.Capacitor (injected by native shell) */
function detectNative(): boolean {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.()
  } catch {
    return false
  }
}

function detectPlatform(): string {
  try {
    return (window as any).Capacitor?.getPlatform?.() || 'web'
  } catch {
    return 'web'
  }
}

/** True when running inside the native Android/iOS shell */
export const isNative = detectNative()
export const isAndroid = detectPlatform() === 'android'
export const isIOS = detectPlatform() === 'ios'

/**
 * Dynamically import a Capacitor plugin by name.
 * Uses string concatenation so Vite/Rolldown cannot statically resolve it —
 * this prevents build failures on servers without @capacitor/* installed.
 */
function capImport(plugin: string): Promise<any> {
  return import(/* @vite-ignore */ '@capacitor/' + plugin)
}

/**
 * Initialize all native plugins. Call once on app startup.
 */
export async function initNativeBridge() {
  if (!isNative) return

  // ── Status Bar ──
  try {
    const { StatusBar, Style } = await capImport('status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#0D0D0D' })
    if (isAndroid) {
      await StatusBar.setOverlaysWebView({ overlay: false })
    }
  } catch { /* not available */ }

  // ── Keyboard ──
  try {
    const { Keyboard } = await capImport('keyboard')
    Keyboard.addListener('keyboardWillShow', () => {
      document.body.classList.add('keyboard-open')
    })
    Keyboard.addListener('keyboardWillHide', () => {
      document.body.classList.remove('keyboard-open')
    })
  } catch { /* not available */ }

  // ── Splash Screen ──
  try {
    const { SplashScreen } = await capImport('splash-screen')
    await SplashScreen.hide()
  } catch { /* not available */ }

  // ── Back Button (Android) ──
  try {
    const { App } = await capImport('app')
    App.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
      if (canGoBack) {
        window.history.back()
      } else {
        App.minimizeApp()
      }
    })
  } catch { /* not available */ }
}

/**
 * Set status bar style based on theme.
 */
export async function setStatusBarTheme(isDark: boolean) {
  if (!isNative) return
  try {
    const { StatusBar, Style } = await capImport('status-bar')
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: isDark ? '#0D0D0D' : '#FFFFFF' })
  } catch { /* silent */ }
}
