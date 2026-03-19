import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import type { Conversation, Message, ChatFolder } from '../types'

const MAX_CONVERSATIONS = 50
const MAX_MESSAGES_PER_CONV = 100

function storageKey(userId: string) { return `convoia_chats_${userId}` }
function foldersKey(userId: string) { return `convoia_folders_${userId}` }

function trimForStorage(convs: Conversation[]): Conversation[] {
  return convs
    .slice(0, MAX_CONVERSATIONS)
    .map((conv) => ({
      ...conv,
      messages: conv.messages.slice(-MAX_MESSAGES_PER_CONV),
    }))
}

function loadConversations(userId: string | undefined): Conversation[] {
  if (!userId) return []
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadFolders(userId: string | undefined): ChatFolder[] {
  if (!userId) return []
  try {
    const raw = localStorage.getItem(foldersKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export interface ChatContextType {
  conversations: Conversation[]
  folders: ChatFolder[]
  activeConversationId: string | null
  activeConversation: Conversation | null
  messages: Message[]
  isStreaming: boolean
  agentMode: boolean
  setAgentMode: (v: boolean) => void
  createConversation: (modelId: string, modelName: string, industry?: string) => Conversation
  deleteConversation: (id: string) => void
  setActiveConversation: (id: string | null) => void
  renameConversation: (id: string, title: string) => void
  togglePin: (id: string) => void
  moveToFolder: (convId: string, folderId: string | undefined) => void
  createFolder: (name: string) => void
  deleteFolder: (id: string) => void
  sendMessage: (content: string, modelId: string, industry?: string, agentId?: string) => Promise<void>
  sendWithContext: (content: string, modelId: string, systemContext: string | null, messageExtras?: Partial<Message>, industry?: string, agentId?: string) => Promise<void>
  editAndResend: (messageId: string, newContent: string, modelId: string, industry?: string, agentId?: string) => Promise<void>
  deleteMessage: (messageId: string) => void
  clearMessages: () => void
  retryLastMessage: (modelId: string, industry?: string, agentId?: string) => void
  addMessages: (msgs: Message[]) => void
}

export const ChatContext = createContext<ChatContextType | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [folders, setFolders] = useState<ChatFolder[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [agentMode, setAgentMode] = useState(false)

  // Reload conversations when user changes
  useEffect(() => {
    setConversations(loadConversations(userId))
    setFolders(loadFolders(userId))
    setActiveId(null)
    setMessages([])
  }, [userId])

  // Persist conversations to user-namespaced key
  useEffect(() => {
    if (!userId) return
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(trimForStorage(conversations)))
    } catch (err) {
      console.error('Failed to save conversations:', err)
      if (conversations.length > 10) {
        try {
          localStorage.setItem(storageKey(userId), JSON.stringify(trimForStorage(conversations.slice(0, 10))))
        } catch { /* storage truly full */ }
      }
    }
  }, [conversations, userId])

  // Persist folders to user-namespaced key
  useEffect(() => {
    if (userId) {
      localStorage.setItem(foldersKey(userId), JSON.stringify(folders))
    }
  }, [folders, userId])

  const activeConversation = conversations.find((c) => c.id === activeId) || null

  // Sync messages to conversation
  useEffect(() => {
    if (activeId && messages.length > 0) {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c
          const totalCost = messages.reduce((s, m) => s + (m.cost || 0), 0)
          const totalTokens = messages.reduce((s, m) => s + (m.tokensInput || 0) + (m.tokensOutput || 0), 0)
          const firstUserMsg = messages.find((m) => m.role === 'user')
          const title = c.title !== 'New Chat' ? c.title : (firstUserMsg ? firstUserMsg.content.slice(0, 50) : 'New Chat')
          return { ...c, messages, totalCost, totalTokens, title, updatedAt: new Date().toISOString() }
        })
      )
    }
  }, [messages, activeId])

  const setActiveConversation = useCallback((id: string | null) => {
    setActiveId(id)
    if (id && userId) {
      const conv = loadConversations(userId).find((c) => c.id === id)
      if (conv) setMessages(conv.messages)
    } else {
      setMessages([])
    }
  }, [userId])

  const createConversation = useCallback((modelId: string, modelName: string, industry?: string) => {
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
    setMessages([])
    return conv
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeId === id) { setActiveId(null); setMessages([]) }
  }, [activeId])

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title } : c))
  }, [])

  const togglePin = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, isPinned: !c.isPinned } : c))
  }, [])

  const moveToFolder = useCallback((convId: string, folderId: string | undefined) => {
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, folderId } : c))
  }, [])

  const createFolder = useCallback((name: string) => {
    setFolders((prev) => [...prev, { id: uuidv4(), name }])
  }, [])

  const deleteFolder = useCallback((id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id))
    setConversations((prev) => prev.map((c) => c.folderId === id ? { ...c, folderId: undefined } : c))
  }, [])

  const sendMessage = useCallback(async (content: string, modelId: string, industry?: string, agentId?: string) => {
    const userMsg: Message = { id: uuidv4(), role: 'user', content, timestamp: new Date().toISOString() }
    const loadingMsg: Message = { id: uuidv4(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isLoading: true }

    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setIsStreaming(true)

    try {
      const allMsgs = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
      const res = await api.post('/ai/query', { modelId, messages: allMsgs, industry, agentId })
      const data = res.data.data
      let responseContent = data.response || data.content || ''
      if (data.fallback?.used) {
        responseContent = `> **Note:** ${data.fallback.reason}. Response from **${data.fallback.model}** instead.\n\n${responseContent}`
      }
      if (data.autoDowngraded) {
        responseContent = `> **Budget limit reached.** ${data.autoDowngradeReason}\n\n${responseContent}`
      }
      const assistantMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: responseContent,
        tokensInput: Number(data.tokens?.input || data.tokensInput || 0) || 0,
        tokensOutput: Number(data.tokens?.output || data.tokensOutput || 0) || 0,
        cost: Number(data.cost?.charged || data.customerPrice || 0) || 0,
        model: data.model || modelId,
        provider: data.provider,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => prev.map((m) => m.id === loadingMsg.id ? assistantMsg : m))
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message :
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to get response'
      setMessages((prev) => prev.map((m) => m.id === loadingMsg.id ? { ...m, isLoading: false, error: errorMsg, content: errorMsg } : m))
    } finally {
      setIsStreaming(false)
    }
  }, [messages])

  const sendWithContext = useCallback(async (content: string, modelId: string, systemContext: string | null, messageExtras?: Partial<Message>, industry?: string, agentId?: string) => {
    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      ...messageExtras,
    }
    const loadingMsg: Message = { id: uuidv4(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isLoading: true }

    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setIsStreaming(true)

    try {
      // Build messages for API — include system context if provided (invisible to UI)
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
      const messagesForAPI = systemContext
        ? [{ role: 'system' as const, content: systemContext }, ...history]
        : history

      const res = await api.post('/ai/query', { modelId, messages: messagesForAPI, industry, agentId })
      const data = res.data.data
      let responseContent = data.response || data.content || ''
      if (data.fallback?.used) {
        responseContent = `> **Note:** ${data.fallback.reason}. Response from **${data.fallback.model}** instead.\n\n${responseContent}`
      }
      if (data.autoDowngraded) {
        responseContent = `> **Budget limit reached.** ${data.autoDowngradeReason}\n\n${responseContent}`
      }
      const assistantMsg: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: responseContent,
        tokensInput: Number(data.tokens?.input || data.tokensInput || 0) || 0,
        tokensOutput: Number(data.tokens?.output || data.tokensOutput || 0) || 0,
        cost: Number(data.cost?.charged || data.customerPrice || 0) || 0,
        model: data.model || modelId,
        provider: data.provider,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => prev.map((m) => m.id === loadingMsg.id ? assistantMsg : m))
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message :
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to get response'
      setMessages((prev) => prev.map((m) => m.id === loadingMsg.id ? { ...m, isLoading: false, error: errorMsg, content: errorMsg } : m))
    } finally {
      setIsStreaming(false)
    }
  }, [messages])

  const editAndResend = useCallback(async (messageId: string, newContent: string, modelId: string, industry?: string, agentId?: string) => {
    const msgIndex = messages.findIndex((m) => m.id === messageId)
    if (msgIndex === -1) return
    const trimmed = messages.slice(0, msgIndex)
    setMessages(trimmed)
    await sendMessage(newContent, modelId, industry, agentId)
  }, [messages, sendMessage])

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }, [])

  const clearMessages = useCallback(() => { setMessages([]) }, [])

  const addMessages = useCallback((msgs: Message[]) => {
    setMessages((prev) => [...prev, ...msgs])
  }, [])

  const retryLastMessage = useCallback((modelId: string, industry?: string, agentId?: string) => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) {
      setMessages((prev) => prev.slice(0, -2))
      sendMessage(lastUser.content, modelId, industry, agentId)
    }
  }, [messages, sendMessage])

  return (
    <ChatContext.Provider value={{
      conversations, folders, activeConversationId: activeId, activeConversation,
      messages, isStreaming, agentMode, setAgentMode,
      createConversation, deleteConversation, setActiveConversation,
      renameConversation, togglePin, moveToFolder,
      createFolder, deleteFolder,
      sendMessage, sendWithContext, editAndResend, deleteMessage, clearMessages, retryLastMessage, addMessages,
    }}>
      {children}
    </ChatContext.Provider>
  )
}
