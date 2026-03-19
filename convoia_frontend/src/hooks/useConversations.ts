import { useCallback, useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAuth } from './useAuth'
import type { Conversation, Message } from '../types'

const MAX_CONVERSATIONS = 50
const MAX_MESSAGES_PER_CONV = 100

function getStorageKey(userId: string | undefined): string | null {
  return userId ? `convoia_chats_${userId}` : null
}

function trimForStorage(convs: Conversation[]): Conversation[] {
  return convs
    .slice(0, MAX_CONVERSATIONS)
    .map((conv) => ({
      ...conv,
      messages: conv.messages.slice(-MAX_MESSAGES_PER_CONV),
    }))
}

function loadFromStorage(userId: string | undefined): Conversation[] {
  const key = getStorageKey(userId)
  if (!key) return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveToStorage(userId: string | undefined, conversations: Conversation[]) {
  const key = getStorageKey(userId)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(trimForStorage(conversations)))
  } catch (err) {
    console.error('Failed to save conversations:', err)
    // localStorage might be full — keep only recent conversations
    if (conversations.length > 10) {
      try {
        localStorage.setItem(key, JSON.stringify(trimForStorage(conversations.slice(0, 10))))
      } catch {
        // Storage truly full — nothing we can do
      }
    }
  }
}

export function useConversations() {
  const { user } = useAuth()
  const userId = user?.id

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Reload when user changes
  useEffect(() => {
    setConversations(loadFromStorage(userId))
    setActiveId(null)
    setLoaded(true)
  }, [userId])

  // Persist — only after initial load
  useEffect(() => {
    if (!loaded) return
    saveToStorage(userId, conversations)
  }, [conversations, userId, loaded])

  const activeConversation = conversations.find((c) => c.id === activeId) || null

  const createConversation = useCallback(
    (modelId: string, modelName: string, industry?: string) => {
      const conv: Conversation = {
        id: uuidv4(),
        title: 'New Chat',
        modelId,
        modelName,
        industry,
        messages: [],
        totalCost: 0,
        totalTokens: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setConversations((prev) => [conv, ...prev])
      setActiveId(conv.id)
      return conv
    },
    []
  )

  const updateConversation = useCallback((id: string, messages: Message[]) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const totalCost = messages.reduce((sum, m) => sum + (m.cost || 0), 0)
        const totalTokens = messages.reduce(
          (sum, m) => sum + (m.tokensInput || 0) + (m.tokensOutput || 0),
          0
        )
        const firstUserMsg = messages.find((m) => m.role === 'user')
        const title =
          c.title !== 'New Chat'
            ? c.title
            : firstUserMsg
              ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
              : 'New Chat'
        return {
          ...c,
          messages,
          totalCost,
          totalTokens,
          title,
          updatedAt: new Date().toISOString(),
        }
      })
    )
  }, [])

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) setActiveId(null)
    },
    [activeId]
  )

  const clearAllConversations = useCallback(() => {
    setConversations([])
    const key = getStorageKey(userId)
    if (key) localStorage.removeItem(key)
  }, [userId])

  const getConversation = useCallback(
    (id: string) => {
      return conversations.find((conv) => conv.id === id)
    },
    [conversations]
  )

  return {
    conversations,
    activeConversation,
    activeId,
    loaded,
    setActiveId,
    createConversation,
    updateConversation,
    deleteConversation,
    clearAllConversations,
    getConversation,
  }
}
