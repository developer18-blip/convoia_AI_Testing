import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { setToken as setStorageToken, setRefreshToken as setStorageRefresh, setUserProfile, clearAuth } from '../lib/storage'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  googleLogin: (idToken: string) => Promise<void>
  register: (data: Record<string, string>) => Promise<void>
  logout: () => void
  updateUser: (updates: Partial<User>) => void
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  googleLogin: async () => {},
  register: async () => {},
  logout: () => {},
  updateUser: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  // ── Restore auth from localStorage on mount ──
  useEffect(() => {
    const storedToken = localStorage.getItem('convoia_token')
    const storedUser = localStorage.getItem('convoia_user')

    if (!storedToken || !storedUser) {
      setIsLoading(false)
      return
    }

    let parsedUser: User | null = null
    try {
      parsedUser = JSON.parse(storedUser)
    } catch {
      localStorage.removeItem('convoia_token')
      localStorage.removeItem('convoia_refresh_token')
      localStorage.removeItem('convoia_user')
      setIsLoading(false)
      return
    }

    // Set state immediately so the UI doesn't flash login page
    setToken(storedToken)
    setUser(parsedUser)

    // Verify in background — if token expired, interceptor auto-refreshes
    api.get('/auth/profile')
      .then((res) => {
        const freshUser = res.data.data?.user || res.data.data
        if (freshUser?.id) {
          setUser(freshUser)
          localStorage.setItem('convoia_user', JSON.stringify(freshUser))
        }
        const currentToken = localStorage.getItem('convoia_token')
        if (currentToken && currentToken !== storedToken) {
          setToken(currentToken)
        }
      })
      .catch(() => {
        setToken(null)
        setUser(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  // ── Deep link auth handler (Google OAuth on mobile) ──
  // Listens for 'convoia:auth' custom event dispatched by the Capacitor
  // deep link handler. This updates React state directly, avoiding the
  // race condition where ProtectedRoute redirects to /login before
  // localStorage is read.
  useEffect(() => {
    const handleDeepLinkAuth = (e: Event) => {
      const { token: newToken, refreshToken, user: userData } = (e as CustomEvent).detail
      if (!newToken || !userData) return

      localStorage.setItem('convoia_token', newToken)
      if (refreshToken) localStorage.setItem('convoia_refresh_token', refreshToken)
      localStorage.setItem('convoia_user', JSON.stringify(userData))
      setStorageToken(newToken)
      if (refreshToken) setStorageRefresh(refreshToken)
      setUserProfile(userData)

      setToken(newToken)
      setUser(userData)
      setIsLoading(false)
      navigate(userData.role === 'platform_admin' ? '/admin' : '/dashboard')
    }

    window.addEventListener('convoia:auth', handleDeepLinkAuth)
    return () => window.removeEventListener('convoia:auth', handleDeepLinkAuth)
  }, [navigate])

  const redirectByRole = useCallback(
    (role: string) => {
      if (role === 'platform_admin') navigate('/admin')
      else navigate('/dashboard')
    },
    [navigate]
  )

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await api.post('/auth/login', { email, password })
        const { token: newToken, refreshToken, user: userData } = res.data.data
        localStorage.setItem('convoia_token', newToken)
        localStorage.setItem('convoia_refresh_token', refreshToken)
        localStorage.setItem('convoia_user', JSON.stringify(userData))
        // Also save to @capacitor/preferences on native (secure storage)
        await setStorageToken(newToken)
        await setStorageRefresh(refreshToken)
        await setUserProfile(userData)
        setToken(newToken)
        setUser(userData)
        redirectByRole(userData.role)
      } catch (err: any) {
        if (err?.response?.data?.message === 'EMAIL_NOT_VERIFIED') {
          localStorage.setItem('convoia_pending_email', email)
          navigate('/verify-email')
          return
        }
        throw err
      }
    },
    [redirectByRole, navigate]
  )

  const googleLogin = useCallback(
    async (idToken: string) => {
      const res = await api.post('/auth/google', { idToken })
      const { token: newToken, refreshToken, user: userData } = res.data.data
      localStorage.setItem('convoia_token', newToken)
      localStorage.setItem('convoia_refresh_token', refreshToken)
      localStorage.setItem('convoia_user', JSON.stringify(userData))
      setStorageToken(newToken); setStorageRefresh(refreshToken); setUserProfile(userData)
      setToken(newToken)
      setUser(userData)
      redirectByRole(userData.role)
    },
    [redirectByRole]
  )

  const register = useCallback(
    async (data: Record<string, string>) => {
      const res = await api.post('/auth/register', data)
      const { token: newToken, refreshToken, user: userData, requiresVerification } = res.data.data

      if (requiresVerification) {
        localStorage.setItem('convoia_pending_email', userData.email)
        navigate('/verify-email')
        return
      }

      localStorage.setItem('convoia_token', newToken)
      localStorage.setItem('convoia_refresh_token', refreshToken)
      localStorage.setItem('convoia_user', JSON.stringify(userData))
      setStorageToken(newToken); setStorageRefresh(refreshToken); setUserProfile(userData)
      setToken(newToken)
      setUser(userData)
      redirectByRole(userData.role)
    },
    [redirectByRole, navigate]
  )

  const logout = useCallback(() => {
    localStorage.removeItem('convoia_token')
    localStorage.removeItem('convoia_refresh_token')
    localStorage.removeItem('convoia_user')
    clearAuth() // Clear @capacitor/preferences on native
    setToken(null)
    setUser(null)
    navigate('/login')
  }, [navigate])

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      localStorage.setItem('convoia_user', JSON.stringify(updated))
      return updated
    })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        googleLogin,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
