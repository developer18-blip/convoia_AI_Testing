import { useCallback, useEffect, useRef, useState } from 'react'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'https://convoia.ai/api'

export interface ChatbotMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Set on assistant messages once streaming completes. */
  cost?: number
  inputTokens?: number
  outputTokens?: number
  model?: string
  provider?: string
  /** True while this message is still streaming. */
  isStreaming?: boolean
  /** Set on assistant messages — error came back from server, not from token. */
  errored?: boolean
}

interface SendOptions {
  /** History snapshot to send to the API. Includes the new user message. */
  apiMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * Public visitor chatbot state machine.
 * Streams from /api/public/chatbot/stream, accumulates assistant chunks
 * into the in-flight message, and finalizes with cost/token data on done.
 */
export function useChatbot() {
  const [messages, setMessages] = useState<ChatbotMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Mirror messages into a ref so sendMessage can read the *current* value
  // synchronously. Reading directly from state inside a useCallback closure
  // would be stale (deps don't include `messages`), and reading inside a
  // setMessages updater is async — by the time the updater runs, fetch has
  // already fired with an empty payload. The ref sidesteps both.
  const messagesRef = useRef<ChatbotMessage[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setMessages([])
    setError(null)
    setIsStreaming(false)
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    setError(null)

    // Build the API payload from the latest messages (read via ref) plus
    // the new user turn. Then schedule the state update — order matters:
    // payload must be assembled before fetch fires, state update can lag.
    const apiMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...messagesRef.current
        .filter((m) => !m.isStreaming && !m.errored)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: trimmed },
    ]

    const userMsg: ChatbotMessage = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      content: trimmed,
    }
    const assistantMsg: ChatbotMessage = {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamFromServer({ apiMessages }, controller, {
        onChunk: (text) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + text }
            }
            return next
          })
        },
        onDone: (info) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                isStreaming: false,
                cost: info.cost,
                inputTokens: info.tokens?.input,
                outputTokens: info.tokens?.output,
                model: info.model,
                provider: info.provider,
              }
            }
            return next
          })
        },
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const reason = (err as Error).message || 'Network error'
      setError(reason)
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            isStreaming: false,
            errored: true,
            content: last.content || `_Sorry — couldn't reach the chatbot. ${reason}_`,
          }
        }
        return next
      })
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [isStreaming])

  return { messages, isStreaming, error, sendMessage, reset }
}

interface StreamCallbacks {
  onChunk: (text: string) => void
  onDone: (info: {
    tokens?: { input?: number; output?: number; total?: number }
    cost?: number
    model?: string
    provider?: string
  }) => void
}

/**
 * SSE consumer. Reads `data: {...}` events from the chatbot stream endpoint
 * and dispatches chunks/done to callbacks. Honors the abort signal.
 */
async function streamFromServer(
  opts: SendOptions,
  controller: AbortController,
  cb: StreamCallbacks,
): Promise<void> {
  const response = await fetch(`${API_BASE}/public/chatbot/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ messages: opts.apiMessages }),
    signal: controller.signal,
  })

  if (!response.ok) {
    let serverMsg = `HTTP ${response.status}`
    try {
      const data = await response.json()
      if (data?.message) serverMsg = data.message
    } catch {
      /* fall through to status code */
    }
    throw new Error(serverMsg)
  }

  if (!response.body) throw new Error('No response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') return
      try {
        const json = JSON.parse(payload)
        if (json.type === 'chunk' && typeof json.content === 'string') {
          cb.onChunk(json.content)
        } else if (json.type === 'done') {
          cb.onDone({
            tokens: json.tokens,
            cost: typeof json.cost === 'number' ? json.cost : undefined,
            model: json.model,
            provider: json.provider,
          })
        }
      } catch {
        /* skip malformed */
      }
    }
  }
}

/**
 * Parse trailing `[CTA:action_id:Label]` and `[FOLLOWUPS:Q1?|Q2?|Q3?]`
 * markers off the end of an assistant message. Returns the visible body
 * with markers stripped, plus extracted CTAs and follow-ups.
 */
export interface ParsedCTA {
  actionId: string
  label: string
}

export interface ParsedAssistantMessage {
  body: string
  cta: ParsedCTA | null
  followups: string[]
}

const CTA_RE = /\[CTA:([a-z_]+):([^\]]+)\]/i
const FOLLOWUPS_RE = /\[FOLLOWUPS:([^\]]+)\]/i

export function parseAssistantMessage(content: string): ParsedAssistantMessage {
  let body = content
  let cta: ParsedCTA | null = null
  let followups: string[] = []

  const ctaMatch = body.match(CTA_RE)
  if (ctaMatch) {
    cta = { actionId: ctaMatch[1].toLowerCase(), label: ctaMatch[2].trim() }
    body = body.replace(CTA_RE, '').trim()
  }

  const fuMatch = body.match(FOLLOWUPS_RE)
  if (fuMatch) {
    followups = fuMatch[1]
      .split('|')
      .map((q) => q.trim())
      .filter((q) => q.length > 0)
      .slice(0, 3)
    body = body.replace(FOLLOWUPS_RE, '').trim()
  }

  return { body, cta, followups }
}

/**
 * Map the bot's action_id to a frontend route. Public IDs that are
 * okay to expose to anonymous users go straight there; protected ones
 * route through /register so the visitor lands at the destination
 * after signup.
 */
const ACTION_ROUTES: Record<string, string> = {
  signup: '/register',
  login: '/login',
  pricing: '/#pricing',
  privacy: '/privacy',
  terms: '/terms',
  api_docs: '/api-docs',
  chat: '/chat',
  buy_tokens: '/tokens/buy',
  buy_starter: '/tokens/buy?package=starter',
  buy_standard: '/tokens/buy?package=standard',
  buy_popular: '/tokens/buy?package=popular',
  buy_power: '/tokens/buy?package=power',
  buy_pro: '/tokens/buy?package=pro',
  buy_enterprise: '/tokens/buy?package=enterprise',
}

export function resolveActionRoute(actionId: string): string | null {
  return ACTION_ROUTES[actionId] || null
}
