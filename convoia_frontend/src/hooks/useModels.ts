import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'
import type { AIModel } from '../types'

const HIDDEN_PROVIDERS = new Set(['groq'])

export function useModels() {
  const [models, setModels] = useState<AIModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchModels = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await api.get('/models')
      // Backend filters inactive models; trust what the API returns.
      const all = ((res.data.data || []) as AIModel[]).filter(
        (m) => !HIDDEN_PROVIDERS.has(m.provider)
      )
      setModels(all)
    } catch (err: unknown) {
      const errObj = err as { response?: { status?: number } }
      const msg = errObj?.response?.status === 429
        ? 'Too many requests. Please wait a moment and try again.'
        : err instanceof Error ? err.message : 'Failed to load models'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  return { models, isLoading, error, refetch: fetchModels }
}
