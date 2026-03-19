import { createContext, useCallback, useState, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Toast } from '../types'

interface ToastContextType {
  toasts: Toast[]
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
  info: (message: string) => void
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextType>({
  toasts: [],
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
  dismiss: () => {},
})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (type: Toast['type'], message: string, duration = 4000) => {
      const id = uuidv4()
      const toast: Toast = { id, type, message, duration }
      setToasts((prev) => [...prev.slice(-2), toast])
      setTimeout(() => dismiss(id), duration)
    },
    [dismiss]
  )

  const success = useCallback((message: string) => addToast('success', message), [addToast])
  const error = useCallback((message: string) => addToast('error', message), [addToast])
  const warning = useCallback((message: string) => addToast('warning', message), [addToast])
  const info = useCallback((message: string) => addToast('info', message), [addToast])

  return (
    <ToastContext.Provider value={{ toasts, success, error, warning, info, dismiss }}>
      {children}
    </ToastContext.Provider>
  )
}
