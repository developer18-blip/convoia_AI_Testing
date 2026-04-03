/**
 * Capacitor Native Bridge
 * Initializes native plugins when running inside a Capacitor shell (Android/iOS).
 * No-ops gracefully on web — all code here is safe to import in any environment.
 */

import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard } from '@capacitor/keyboard'
import { SplashScreen } from '@capacitor/splash-screen'
import { App } from '@capacitor/app'

/** True when running inside the native Android/iOS shell */
export const isNative = Capacitor.isNativePlatform()
export const isAndroid = Capacitor.getPlatform() === 'android'
export const isIOS = Capacitor.getPlatform() === 'ios'

/**
 * Initialize all native plugins. Call once on app startup.
 */
export async function initNativeBridge() {
  if (!isNative) return

  // ── Status Bar ──
  try {
    await StatusBar.setStyle({ style: Style.Dark }) // light text on dark bg
    await StatusBar.setBackgroundColor({ color: '#0D0D0D' })
    if (isAndroid) {
      await StatusBar.setOverlaysWebView({ overlay: false })
    }
  } catch {
    // StatusBar not available
  }

  // ── Keyboard ──
  try {
    // Scroll the chat input into view when keyboard opens
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
    // Hide splash after app is ready (auto-hide may already handle this)
    await SplashScreen.hide()
  } catch {
    // SplashScreen not available
  }

  // ── Back Button (Android) ──
  try {
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back()
      } else {
        // At root — minimize app instead of closing
        App.minimizeApp()
      }
    })
  } catch {
    // App plugin not available
  }
}

/**
 * Set status bar style based on theme.
 * Call when user toggles dark/light mode.
 */
export async function setStatusBarTheme(isDark: boolean) {
  if (!isNative) return
  try {
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: isDark ? '#0D0D0D' : '#FFFFFF' })
  } catch {
    // silent
  }
}
