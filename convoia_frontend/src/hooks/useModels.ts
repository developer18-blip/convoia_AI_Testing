import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'
import type { AIModel } from '../types'

export function useModels() {
  const [models, setModels] = useState<AIModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchModels = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await api.get('/models')
      // TODO: Re-enable mistral and groq when API keys are added
      const HIDDEN_PROVIDERS = ['mistral', 'groq']
      const all = (res.data.data || []) as AIModel[]
      setModels(all.filter(m => !HIDDEN_PROVIDERS.includes(m.provider.toLowerCase())))
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
