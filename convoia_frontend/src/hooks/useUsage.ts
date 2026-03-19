import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'
import type { UsageLog, PaginatedResponse } from '../types'

interface UseUsageOptions {
  page?: number
  limit?: number
  modelId?: string
  status?: string
  startDate?: string
  endDate?: string
}

export function useUsage(options: UseUsageOptions = {}) {
  const [data, setData] = useState<UsageLog[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsage = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (options.page) params.set('page', String(options.page))
      if (options.limit) params.set('limit', String(options.limit))
      if (options.modelId) params.set('modelId', options.modelId)
      if (options.status) params.set('status', options.status)
      if (options.startDate) params.set('startDate', options.startDate)
      if (options.endDate) params.set('endDate', options.endDate)

      const res = await api.get(`/usage/my?${params.toString()}`)
      const result: PaginatedResponse<UsageLog> = res.data.data
      if (result.data) {
        setData(result.data)
        setPagination(result.pagination)
      } else if (Array.isArray(res.data.data)) {
        setData(res.data.data)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load usage data'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [options.page, options.limit, options.modelId, options.status, options.startDate, options.endDate])

  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  return { data, pagination, isLoading, error, refetch: fetchUsage }
}
