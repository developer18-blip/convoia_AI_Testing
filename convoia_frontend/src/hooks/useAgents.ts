import { useEffect, useState } from 'react'
import api from '../lib/api'
import type { Agent } from '../types'

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAgents = async () => {
    try {
      const res = await api.get('/agents')
      setAgents(res.data.data || [])
    } catch {
      console.error('Failed to fetch agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAgents()
  }, [])

  const createAgent = async (data: Partial<Agent> & { shared?: boolean }) => {
    const res = await api.post('/agents', data)
    const newAgent = res.data.data
    setAgents((prev) => [...prev, newAgent])
    return newAgent
  }

  const updateAgent = async (id: string, data: Partial<Agent> & { shared?: boolean }) => {
    const res = await api.put(`/agents/${id}`, data)
    const updated = res.data.data
    setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)))
    return updated
  }

  const deleteAgent = async (id: string) => {
    await api.delete(`/agents/${id}`)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  return { agents, loading, fetchAgents, createAgent, updateAgent, deleteAgent }
}
