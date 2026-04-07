/**
 * Secure Storage Wrapper
 * Uses @capacitor/preferences on native (encrypted device storage)
 * Falls back to localStorage on web (desktop browser)
 *
 * NEVER store sensitive tokens in localStorage on mobile —
 * other apps can access it via WebView exploits.
 */

import { isNative } from './capacitor'

// Dynamic import to avoid bundler errors on server builds
async function getPreferences(): Promise<any> {
  if (!isNative) return null
  try {
    const mod = await import(/* @vite-ignore */ '@capacitor/' + 'preferences')
    return mod.Preferences
  } catch {
    return null
  }
}

// Keys
const KEYS = {
  AUTH_TOKEN: 'convoia_token',
  REFRESH_TOKEN: 'convoia_refresh_token',
  USER: 'convoia_user',
} as const

/** Get a value from secure storage */
export async function getSecure(key: string): Promise<string | null> {
  if (isNative) {
    try {
      const Preferences = await getPreferences()
      if (Preferences) {
        const { value } = await Preferences.get({ key })
        return value
      }
    } catch { /* fall through to localStorage */ }
  }
  try { return localStorage.getItem(key) } catch { return null }
}

/** Set a value in secure storage */
export async function setSecure(key: string, value: string): Promise<void> {
  if (isNative) {
    try {
      const Preferences = await getPreferences()
      if (Preferences) {
        await Preferences.set({ key, value })
        return
      }
    } catch { /* fall through */ }
  }
  try { localStorage.setItem(key, value) } catch { /* silent */ }
}

/** Remove a value from secure storage */
export async function removeSecure(key: string): Promise<void> {
  if (isNative) {
    try {
      const Preferences = await getPreferences()
      if (Preferences) {
        await Preferences.remove({ key })
        return
      }
    } catch { /* fall through */ }
  }
  try { localStorage.removeItem(key) } catch { /* silent */ }
}

/** Clear all secure storage */
export async function clearSecure(): Promise<void> {
  if (isNative) {
    try {
      const Preferences = await getPreferences()
      if (Preferences) {
        await Preferences.clear()
        return
      }
    } catch { /* fall through */ }
  }
  try { localStorage.clear() } catch { /* silent */ }
}

// ── Sync versions (for places that can't await — reads from localStorage cache) ──
// On native, these read from an in-memory cache that's populated on app startup

let _tokenCache: string | null = null
let _userCache: string | null = null

/** Call on app startup to populate the sync cache from Preferences */
export async function initStorageCache(): Promise<void> {
  _tokenCache = await getSecure(KEYS.AUTH_TOKEN)
  _userCache = await getSecure(KEYS.USER)
}

/** Sync read of auth token (from cache on native, localStorage on web) */
export function getTokenSync(): string | null {
  if (isNative) return _tokenCache
  try { return localStorage.getItem(KEYS.AUTH_TOKEN) } catch { return null }
}

/** Update token in both cache and storage */
export async function setToken(token: string): Promise<void> {
  _tokenCache = token
  await setSecure(KEYS.AUTH_TOKEN, token)
}

/** Update refresh token */
export async function setRefreshToken(token: string): Promise<void> {
  await setSecure(KEYS.REFRESH_TOKEN, token)
}

/** Get refresh token */
export async function getRefreshToken(): Promise<string | null> {
  return getSecure(KEYS.REFRESH_TOKEN)
}

/** Update user profile */
export async function setUserProfile(user: any): Promise<void> {
  const str = JSON.stringify(user)
  _userCache = str
  await setSecure(KEYS.USER, str)
}

/** Get user profile (sync from cache) */
export function getUserSync(): any | null {
  const str = isNative ? _userCache : (() => { try { return localStorage.getItem(KEYS.USER) } catch { return null } })()
  if (!str) return null
  try { return JSON.parse(str) } catch { return null }
}

/** Clear all auth data */
export async function clearAuth(): Promise<void> {
  _tokenCache = null
  _userCache = null
  await removeSecure(KEYS.AUTH_TOKEN)
  await removeSecure(KEYS.REFRESH_TOKEN)
  await removeSecure(KEYS.USER)
}

export { KEYS }
