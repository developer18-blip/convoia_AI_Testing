import axios from 'axios'
import { getTokenSync, setToken, setRefreshToken, getRefreshToken, clearAuth } from './storage'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach token ──
api.interceptors.request.use((config) => {
  // Sync read from cache (native) or localStorage (web) — no await needed
  const token = getTokenSync() || localStorage.getItem('convoia_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Refresh lock: prevents multiple concurrent refresh attempts ──
let isRefreshing = false
let refreshQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token!)
  })
  refreshQueue = []
}

// ── Response interceptor: auto-refresh on 401 ──
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    // Only attempt refresh for 401 errors, and not for auth endpoints themselves
    const isAuthEndpoint = original?.url?.includes('/auth/refresh') || original?.url?.includes('/auth/login')
    if (error.response?.status !== 401 || original._retry || isAuthEndpoint) {
      // Retry on 429 (rate limit) with exponential backoff
      if (error.response?.status === 429) {
        original._retryCount = (original._retryCount || 0) + 1
        if (original._retryCount <= 3) {
          const delay = Math.pow(2, original._retryCount) * 1000
          await new Promise((resolve) => setTimeout(resolve, delay))
          return api(original)
        }
      }

      if (error.response?.status === 402) {
        window.dispatchEvent(
          new CustomEvent('wallet:insufficient', { detail: error.response.data })
        )
      }

      return Promise.reject(error)
    }

    // ── 401 handling: refresh token ──
    original._retry = true

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: (newToken: string) => {
            original.headers.Authorization = `Bearer ${newToken}`
            resolve(api(original))
          },
          reject,
        })
      })
    }

    isRefreshing = true

    try {
      const refresh = await getRefreshToken() || localStorage.getItem('convoia_refresh_token')
      if (!refresh) throw new Error('No refresh token')

      const res = await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/refresh`,
        { refreshToken: refresh }
      )

      const newToken = res.data.data.token
      const newRefreshToken = res.data.data.refreshToken

      // Save BOTH new access token AND rotated refresh token
      // Uses @capacitor/preferences on native, localStorage on web
      await setToken(newToken)
      if (newRefreshToken) {
        await setRefreshToken(newRefreshToken)
      }
      // Also keep localStorage in sync for backwards compatibility
      localStorage.setItem('convoia_token', newToken)
      if (newRefreshToken) localStorage.setItem('convoia_refresh_token', newRefreshToken)

      // Process queued requests with new token
      processQueue(null, newToken)

      // Retry the original request
      original.headers.Authorization = `Bearer ${newToken}`
      return api(original)
    } catch (refreshError) {
      processQueue(refreshError, null)

      // Refresh failed — clear auth and redirect
      await clearAuth()
      localStorage.removeItem('convoia_token')
      localStorage.removeItem('convoia_refresh_token')
      localStorage.removeItem('convoia_user')
      window.location.href = '/login'

      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
