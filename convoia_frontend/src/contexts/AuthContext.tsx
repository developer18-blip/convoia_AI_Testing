import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
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
  register: async () => {},
  logout: () => {},
  updateUser: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const storedToken = localStorage.getItem('convoia_token')
    const storedUser = localStorage.getItem('convoia_user')
    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('convoia_token')
        localStorage.removeItem('convoia_refresh_token')
        localStorage.removeItem('convoia_user')
      }
    }
    setIsLoading(false)
  }, [])

  const redirectByRole = useCallback(
    (role: string) => {
      if (role === 'platform_admin') navigate('/admin')
      else navigate('/dashboard')
    },
    [navigate]
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post('/auth/login', { email, password })
      const { token: newToken, refreshToken, user: userData } = res.data.data
      localStorage.setItem('convoia_token', newToken)
      localStorage.setItem('convoia_refresh_token', refreshToken)
      localStorage.setItem('convoia_user', JSON.stringify(userData))
      setToken(newToken)
      setUser(userData)
      redirectByRole(userData.role)
    },
    [redirectByRole]
  )

  const register = useCallback(
    async (data: Record<string, string>) => {
      const res = await api.post('/auth/register', data)
      const { token: newToken, refreshToken, user: userData } = res.data.data
      localStorage.setItem('convoia_token', newToken)
      localStorage.setItem('convoia_refresh_token', refreshToken)
      localStorage.setItem('convoia_user', JSON.stringify(userData))
      setToken(newToken)
      setUser(userData)
      redirectByRole(userData.role)
    },
    [redirectByRole]
  )

  const logout = useCallback(() => {
    // Only remove auth tokens — NEVER touch conversation history
    localStorage.removeItem('convoia_token')
    localStorage.removeItem('convoia_refresh_token')
    localStorage.removeItem('convoia_user')
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
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
