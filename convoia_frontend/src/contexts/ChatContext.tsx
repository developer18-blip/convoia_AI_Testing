import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAuth } from '../hooks/useAuth'
import api from '../lib/api'
import type { Conversation, Message, ChatFolder } from '../types'

const MAX_CONVERSATIONS = 100
const MAX_MESSAGES_PER_CONV = 500

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

// Backend sync helpers (fire-and-forget, don't block UI)
async function syncConversationToBackend(conv: Conversation) {
  try {
    await api.post('/conversations', {
      id: conv.id, title: conv.title, modelName: conv.modelName,
    }).catch(() => {}) // ignore if already exists
  } catch { /* silent */ }
}

async function syncMessagesToBackend(convId: string, messages: Message[]) {
  try {
    const newMsgs = messages.filter(m => m.content && m.role !== 'system').slice(-50) // sync last 50
    if (newMsgs.length === 0) return
    await api.post(`/conversations/${convId}/messages`, { messages: newMsgs }).catch(() => {})
  } catch { /* silent */ }
}

async function loadConversationsFromBackend(): Promise<Conversation[]> {
  try {
    const res = await api.get('/conversations')
    const data = res.data?.data
    if (!Array.isArray(data)) return []
    return data.map((c: any) => ({
      id: c.id, title: c.title, modelId: c.modelId, modelName: c.modelName,
      agentId: c.agentId, industry: c.industry, isPinned: c.isPinned || false,
      folderId: c.folderId, totalCost: c.totalCost || 0, totalTokens: c.totalTokens || 0,
      messages: [], // loaded lazily when conversation is opened
      createdAt: c.createdAt, updatedAt: c.updatedAt,
    }))
  } catch { return [] }
}

async function loadConversationMessages(convId: string): Promise<Message[]> {
  try {
    const res = await api.get(`/conversations/${convId}`)
    const msgs = res.data?.data?.messages
    if (!Array.isArray(msgs)) return []
    return msgs.map((m: any) => ({
      id: m.id, role: m.role, content: m.content,
      model: m.model, provider: m.provider,
      tokensInput: m.tokensInput, tokensOutput: m.tokensOutput,
      cost: m.cost, imageUrl: m.imageUrl, imagePrompt: m.imagePrompt,
      videoUrl: m.videoUrl,
      timestamp: m.createdAt,
    }))
  } catch { return [] }
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
  stopStreaming: () => void
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
  sendMessage: (content: string, modelId: string, industry?: string, agentId?: string, thinkingEnabled?: boolean) => Promise<void>
  sendWithContext: (content: string, modelId: string, systemContext: string | null, messageExtras?: Partial<Message>, industry?: string, agentId?: string, thinkingEnabled?: boolean) => Promise<void>
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
  const [activeId, setActiveIdRaw] = useState<string | null>(() => {
    try { return localStorage.getItem('convoia_activeConvId') || null } catch { return null }
  })
  const setActiveId = useCallback((id: string | null) => {
    setActiveIdRaw(id)
    try {
      if (id) localStorage.setItem('convoia_activeConvId', id)
      else localStorage.removeItem('convoia_activeConvId')
    } catch { /* silent */ }
  }, [])
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [agentMode, setAgentMode] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setIsStreaming(false)
    // Remove isLoading from any streaming message
    setMessages((prev) => prev.map((m) => m.isLoading ? { ...m, isLoading: false, content: m.content || '*(Generation stopped)*' } : m))
  }, [])

  // Reload conversations when user changes — localStorage is primary, backend supplements
  useEffect(() => {
    if (!userId) {
      setActiveId(null)
      setMessages([])
      setConversations([])
      setFolders([])
      return
    }

    // Load from localStorage immediately (fast) — this is the primary source
    const local = loadConversations(userId)
    setConversations(local)
    setFolders(loadFolders(userId))

    // Restore active conversation from localStorage
    const savedActiveId = localStorage.getItem('convoia_activeConvId')
    if (savedActiveId && local.find(c => c.id === savedActiveId)) {
      setActiveId(savedActiveId)
      const activeConv = local.find(c => c.id === savedActiveId)
      if (activeConv?.messages?.length) {
        setMessages(activeConv.messages)
      }
    }

    // Then load from backend and merge — preserve local messages
    loadConversationsFromBackend().then(backendConvs => {
      if (backendConvs.length === 0 && local.length > 0) {
        // First time: migrate localStorage to backend
        api.post('/conversations/sync', { conversations: local.slice(0, 50) }).catch(() => {})
      } else if (backendConvs.length > 0) {
        // Merge: keep local messages, add backend-only conversations
        const localById = new Map(local.map(c => [c.id, c]))
        const merged = backendConvs.map(bc => {
          const lc = localById.get(bc.id)
          // If local has messages, keep them (localStorage is fresher)
          return lc && lc.messages.length > 0 ? { ...bc, messages: lc.messages } : bc
        })
        // Add any local-only conversations not on backend
        const backendIds = new Set(backendConvs.map(c => c.id))
        // Add local-only conversations that have actual messages (skip empty drafts)
        const localOnly = local.filter(c => !backendIds.has(c.id) && c.messages && c.messages.length > 0 && !c._draft)
        const all = [...merged, ...localOnly]
          .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
        setConversations(all)
      }
    })
  }, [userId])

  // Persist conversations to user-namespaced key
  useEffect(() => {
    if (!userId) return
    try {
      // Only persist conversations that have messages (skip empty drafts)
      const toSave = conversations.filter(c => !c._draft && c.messages && c.messages.length > 0)
      localStorage.setItem(storageKey(userId), JSON.stringify(trimForStorage(toSave)))
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

  // Sync messages to conversation (local + backend)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (activeId && messages.length > 0) {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c
          const totalCost = messages.reduce((s, m) => s + (m.cost || 0), 0)
          const totalTokens = messages.reduce((s, m) => s + (m.tokensInput || 0) + (m.tokensOutput || 0), 0)
          const firstUserMsg = messages.find((m) => m.role === 'user')
          const title = c.title !== 'New Chat' ? c.title : (firstUserMsg ? firstUserMsg.content.slice(0, 50) : 'New Chat')
          // If this was a draft, mark it as synced now that it has messages
          const wasDraft = c._draft
          const updated = { ...c, messages, totalCost, totalTokens, title, updatedAt: new Date().toISOString(), _draft: undefined }
          // Sync draft conversation to backend on first message
          if (wasDraft) syncConversationToBackend(updated)
          return updated
        })
      )

      // Debounced sync to backend (don't send on every keystroke/chunk)
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
      syncTimeoutRef.current = setTimeout(() => {
        syncMessagesToBackend(activeId, messages)
      }, 2000)
    }
  }, [messages, activeId])

  const setActiveConversation = useCallback((id: string | null) => {
    setActiveId(id)
    if (id && userId) {
      // Try local first (instant)
      const localConv = conversations.find((c) => c.id === id)
      if (localConv && localConv.messages && localConv.messages.length > 0) {
        setMessages(localConv.messages)
      } else {
        setMessages([])
        // Load from backend
        loadConversationMessages(id).then(msgs => {
          if (msgs.length > 0) {
            setMessages(msgs)
            // Update local cache
            setConversations(prev => prev.map(c =>
              c.id === id ? { ...c, messages: msgs } : c
            ))
          }
        })
      }
    } else {
      setMessages([])
    }
  }, [userId, conversations])

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
      _draft: true, // NOT synced to backend until first message
    }
    setConversations((prev) => [conv, ...prev])
    setActiveId(conv.id)
    setMessages([])
    // DO NOT sync to backend here — deferred until first message is sent
    return conv
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    api.delete(`/conversations/${id}`).catch(() => {})
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

  const sendMessage = useCallback(async (content: string, modelId: string, industry?: string, agentId?: string, thinkingEnabled?: boolean) => {
    const userMsg: Message = { id: uuidv4(), role: 'user', content, timestamp: new Date().toISOString() }
    const assistantId = uuidv4()
    const streamingMsg: Message = { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString(), isLoading: true }

    setMessages((prev) => [...prev, userMsg, streamingMsg])
    setIsStreaming(true)

    // Create abort controller for stop functionality
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const allMsgs = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
      const token = localStorage.getItem('convoia_token')
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

      // Find the most recent image from conversation including current message
      const lastImage = [...messages, userMsg].reverse().find((m) => m.imagePreview)?.imagePreview

      const response = await fetch(`${baseUrl}/ai/query/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ modelId, messages: allMsgs, industry, agentId, thinkingEnabled, ...(lastImage ? { referenceImage: lastImage } : {}) }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: 'Failed to get response' }))
        throw new Error(errData.message || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      let metadata: { model?: string; provider?: string; tokens?: { input: number; output: number }; cost?: { charged: string }; imageUrl?: string; videoUrl?: string; videoGenerated?: boolean; imageGenerated?: boolean } = {}
      let _ft: ReturnType<typeof setTimeout> | null = null
      const _flush = () => { const s = accumulated; setMessages((p) => p.map((m) => m.id === assistantId ? { ...m, content: s, isLoading: false } : m)) }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const parsed = JSON.parse(trimmed.slice(6))

            if (parsed.type === 'chunk') {
              accumulated += parsed.content
              // Throttle UI updates to every 80ms instead of every chunk
              if (!_ft) { _ft = setTimeout(() => { _ft = null; _flush() }, 80) }
            } else if (parsed.type === 'status') {
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: '', isLoading: true, statusText: parsed.content } : m
              ))
            } else if (parsed.type === 'web_search') {
              accumulated = ''
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: '', isLoading: false, webSearch: { query: parsed.query, sources: parsed.sources || [] } } : m
              ))
            } else if (parsed.type === 'thinking_result') {
              // Deep thinking result — show as blockquote (markdown-native, no raw HTML)
              const thinkBlock = `> **🧠 Deep Thinking**\n>\n> ${parsed.content.replace(/\n/g, '\n> ')}\n\n---\n\n`
              accumulated += thinkBlock
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated, isLoading: true, statusText: 'Refining answer...' } : m
              ))
            } else if (parsed.type === 'note') {
              accumulated += `> **Note:** ${parsed.content}\n\n`
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated, isLoading: false } : m
              ))
            } else if (parsed.type === 'done') {
              metadata = parsed
            } else if (parsed.type === 'error') {
              throw new Error(parsed.content)
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e
          }
        }
      }

      // Clear throttle timer BEFORE final state (prevents overwriting videoUrl/imageUrl)
      if (_ft) clearTimeout(_ft)
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? {
          ...m,
          content: accumulated,
          isLoading: false,
          tokensInput: metadata.tokens?.input || 0,
          tokensOutput: metadata.tokens?.output || 0,
          cost: Number(metadata.cost?.charged || 0) || 0,
          model: metadata.model || modelId,
          provider: metadata.provider,
          ...(metadata.imageUrl ? { imageUrl: metadata.imageUrl } : {}),
          ...(metadata.videoUrl ? { videoUrl: metadata.videoUrl } : {}),
        } : m
      ))

      // Refresh wallet balance after tokens were used
      window.dispatchEvent(new Event('tokens:refresh'))
    } catch (err: unknown) {
      // If user stopped, don't show error
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages((prev) => prev.map((m) => m.id === assistantId && m.isLoading ? { ...m, isLoading: false } : m))
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Failed to get response'
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, isLoading: false, error: errorMsg, content: errorMsg } : m))
      }
    } finally {
      abortRef.current = null
      setIsStreaming(false)
    }
  }, [messages])

  const sendWithContext = useCallback(async (content: string, modelId: string, systemContext: string | null, messageExtras?: Partial<Message>, industry?: string, agentId?: string, thinkingEnabled?: boolean) => {
    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      ...messageExtras,
    }
    const assistantId = uuidv4()
    const streamingMsg: Message = { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString(), isLoading: true }

    setMessages((prev) => [...prev, userMsg, streamingMsg])
    setIsStreaming(true)

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
      // Embed document/file context directly into the last user message
      // Using role:'system' caused issues with Anthropic and other providers
      let messagesForAPI = history
      if (systemContext) {
        const lastIdx = messagesForAPI.length - 1
        messagesForAPI = [...messagesForAPI]
        messagesForAPI[lastIdx] = {
          ...messagesForAPI[lastIdx],
          content: `Here is the attached document content:\n\n${systemContext}\n\n---\n\nUser question: ${messagesForAPI[lastIdx].content}`,
        }
      }

      const token = localStorage.getItem('convoia_token')
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

      // Collect ALL images from the current message (supports multiple image uploads)
      const currentMsg = userMsg
      let referenceImages: string[] = []
      if (currentMsg.imagePreviews && currentMsg.imagePreviews.length > 0) {
        referenceImages = currentMsg.imagePreviews
      } else if (currentMsg.imagePreview) {
        referenceImages = [currentMsg.imagePreview]
      }

      const response = await fetch(`${baseUrl}/ai/query/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          modelId, messages: messagesForAPI, industry, agentId, thinkingEnabled,
          ...(referenceImages.length === 1 ? { referenceImage: referenceImages[0] } : {}),
          ...(referenceImages.length > 1 ? { referenceImages } : {}),
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: 'Failed to get response' }))
        throw new Error(errData.message || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      let metadata: { model?: string; provider?: string; tokens?: { input: number; output: number }; cost?: { charged: string }; imageUrl?: string; videoUrl?: string; videoGenerated?: boolean; imageGenerated?: boolean } = {}
      let _ft: ReturnType<typeof setTimeout> | null = null
      const _flush = () => { const s = accumulated; setMessages((p) => p.map((m) => m.id === assistantId ? { ...m, content: s, isLoading: false } : m)) }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const parsed = JSON.parse(trimmed.slice(6))

            if (parsed.type === 'chunk') {
              accumulated += parsed.content
              // Throttle UI updates to every 80ms instead of every chunk
              if (!_ft) { _ft = setTimeout(() => { _ft = null; _flush() }, 80) }
            } else if (parsed.type === 'status') {
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: '', isLoading: true, statusText: parsed.content } : m
              ))
            } else if (parsed.type === 'web_search') {
              accumulated = ''
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: '', isLoading: false, webSearch: { query: parsed.query, sources: parsed.sources || [] } } : m
              ))
            } else if (parsed.type === 'thinking_result') {
              // Deep thinking result — show as blockquote (markdown-native, no raw HTML)
              const thinkBlock = `> **🧠 Deep Thinking**\n>\n> ${parsed.content.replace(/\n/g, '\n> ')}\n\n---\n\n`
              accumulated += thinkBlock
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated, isLoading: true, statusText: 'Refining answer...' } : m
              ))
            } else if (parsed.type === 'note') {
              accumulated += `> **Note:** ${parsed.content}\n\n`
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated, isLoading: false } : m
              ))
            } else if (parsed.type === 'done') {
              metadata = parsed
            } else if (parsed.type === 'error') {
              throw new Error(parsed.content)
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e
          }
        }
      }

      // Clear throttle timer BEFORE final state (prevents overwriting videoUrl/imageUrl)
      if (_ft) clearTimeout(_ft)
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? {
          ...m,
          content: accumulated,
          isLoading: false,
          tokensInput: metadata.tokens?.input || 0,
          tokensOutput: metadata.tokens?.output || 0,
          cost: Number(metadata.cost?.charged || 0) || 0,
          model: metadata.model || modelId,
          provider: metadata.provider,
          ...(metadata.imageUrl ? { imageUrl: metadata.imageUrl } : {}),
          ...(metadata.videoUrl ? { videoUrl: metadata.videoUrl } : {}),
        } : m
      ))

      // Refresh wallet balance after tokens were used
      window.dispatchEvent(new Event('tokens:refresh'))
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get response'
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, isLoading: false, error: errorMsg, content: errorMsg } : m))
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
      messages, isStreaming, stopStreaming, agentMode, setAgentMode,
      createConversation, deleteConversation, setActiveConversation,
      renameConversation, togglePin, moveToFolder,
      createFolder, deleteFolder,
      sendMessage, sendWithContext, editAndResend, deleteMessage, clearMessages, retryLastMessage, addMessages,
    }}>
      {children}
    </ChatContext.Provider>
  )
}
