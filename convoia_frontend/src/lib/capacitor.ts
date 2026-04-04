/**
 * Capacitor Native Bridge
 * Initializes native plugins when running inside a Capacitor shell (Android/iOS).
 * Uses dynamic imports so it builds fine on servers without Capacitor installed.
 */

/** Detect native platform without importing @capacitor/core at top level */
function detectNative(): boolean {
  try {
    // Capacitor injects this on the window in native shells
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
 * Initialize all native plugins. Call once on app startup.
 * Uses dynamic import() so the app builds even without Capacitor packages.
 */
export async function initNativeBridge() {
  if (!isNative) return

  // ── Status Bar ──
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#0D0D0D' })
    if (isAndroid) {
      await StatusBar.setOverlaysWebView({ overlay: false })
    }
  } catch {
    // StatusBar not available
  }

  // ── Keyboard ──
  try {
    const { Keyboard } = await import('@capacitor/keyboard')
    Keyboard.addListener('keyboardWillShow', () => {
      document.body.classList.add('keyboard-open')
    })
    Keyboard.addListener('keyboardWillHide', () => {
      document.body.classList.remove('keyboard-open')
    })
  } catch {
    // Keyboard plugin not available
  }

  // ── Splash Screen ──
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide()
  } catch {
    // SplashScreen not available
  }

  // ── Back Button (Android) ──
  try {
    const { App } = await import('@capacitor/app')
    App.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
      if (canGoBack) {
        window.history.back()
      } else {
        App.minimizeApp()
      }
    })
  } catch {
    // App plugin not available
  }
}

/**
 * Set status bar style based on theme.
 */
export async function setStatusBarTheme(isDark: boolean) {
  if (!isNative) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: isDark ? '#0D0D0D' : '#FFFFFF' })
  } catch {
    // silent
  }
}
