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

let googleAuthInitialized = false

/**
 * Native Google Sign-In — invokes Google Play Services' account picker
 * directly (no browser flip). Returns the Google ID token, which the
 * backend already accepts at POST /api/auth/google.
 *
 * Returns null when the plugin isn't available (e.g. running on web, or
 * when the GCP Android OAuth client hasn't been provisioned yet) so the
 * caller can fall back to the system-browser redirect flow.
 *
 * Uses a dynamic import with a LITERAL specifier so Vite bundles the plugin
 * into the mobile chunk (rather than leaving it as a bare runtime specifier
 * the browser can't resolve). The import is gated on `isNative` so web
 * builds never evaluate it.
 */
export async function nativeGoogleSignIn(): Promise<{ idToken: string } | null> {
  if (!isNative) return null
  try {
    const mod = await import('@codetrix-studio/capacitor-google-auth')
    const GoogleAuth = mod.GoogleAuth
    if (!googleAuthInitialized) {
      await GoogleAuth.initialize()
      googleAuthInitialized = true
    }
    const result = await GoogleAuth.signIn()
    const idToken = result?.authentication?.idToken || (result as any)?.idToken
    if (!idToken) return null
    return { idToken }
  } catch (err: any) {
    console.warn('[GoogleAuth] native sign-in failed:', err?.message || err)
    return null
  }
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

    // ── Deep Link Handler (Google OAuth callback) ──
    // Catches convoia://auth?token=xxx&user=xxx from Google OAuth redirect.
    // Dispatches a custom event so AuthContext picks up the token in React state
    // instead of relying on a page reload (which causes a race condition).
    const handleAuthDeepLink = (url: string) => {
      try {
        if (!url.startsWith('convoia://auth')) return false
        const queryString = url.split('?')[1]
        if (!queryString) return false
        const params = new URLSearchParams(queryString)
        const token = params.get('token')
        const refreshToken = params.get('refreshToken')
        const userStr = params.get('user')

        if (token && userStr) {
          const user = JSON.parse(userStr)
          localStorage.setItem('convoia_token', token)
          if (refreshToken) localStorage.setItem('convoia_refresh_token', refreshToken)
          localStorage.setItem('convoia_user', JSON.stringify(user))

          window.dispatchEvent(new CustomEvent('convoia:auth', {
            detail: { token, refreshToken, user },
          }))
          return true
        }
      } catch { /* invalid URL */ }
      return false
    }

    // Check if app was LAUNCHED via deep link (cold start)
    try {
      const launchUrl = await App.getLaunchUrl()
      if (launchUrl?.url) handleAuthDeepLink(launchUrl.url)
    } catch { /* no launch URL */ }

    // Listen for deep links while app is running (warm resume)
    App.addListener('appUrlOpen', ({ url }: { url: string }) => {
      handleAuthDeepLink(url)
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
