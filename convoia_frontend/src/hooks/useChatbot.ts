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
 * Resolved action — the route to navigate to + whether it requires auth.
 * The widget uses `isProtected` to decide whether to send a logged-out
 * visitor through /register first (preserving intent via sessionStorage
 * so AuthContext drops them at the destination, not the default /chat).
 */
export interface ResolvedAction {
  path: string
  isProtected: boolean
}

/**
 * Master action map. Additions here automatically become callable by the
 * bot — just teach it the new action_id in chatbotKnowledgeBase.ts and
 * pick a sensible default label. Keys are normalized (lowercase, no
 * whitespace) so a slightly off model emission still resolves.
 */
const ACTION_ROUTES: Record<string, ResolvedAction> = {
  // Auth / public
  signup:        { path: '/register',                          isProtected: false },
  register:      { path: '/register',                          isProtected: false },
  login:         { path: '/login',                             isProtected: false },
  pricing:       { path: '/#pricing',                          isProtected: false },
  features:      { path: '/#features',                         isProtected: false },
  how_it_works:  { path: '/#how-it-works',                     isProtected: false },
  reviews:       { path: '/#reviews',                          isProtected: false },
  privacy:       { path: '/privacy',                           isProtected: false },
  terms:         { path: '/terms',                             isProtected: false },

  // Core app surfaces (require auth)
  chat:          { path: '/chat',                              isProtected: true },
  dashboard:     { path: '/dashboard',                         isProtected: true },
  models:        { path: '/models',                            isProtected: true },
  api_keys:      { path: '/api-keys',                          isProtected: true },
  api_docs:      { path: '/api-docs',                          isProtected: true },

  // Token purchase flows
  buy_tokens:      { path: '/tokens/buy',                      isProtected: true },
  buy_starter:     { path: '/tokens/buy?package=starter',      isProtected: true },
  buy_standard:    { path: '/tokens/buy?package=standard',     isProtected: true },
  buy_popular:     { path: '/tokens/buy?package=popular',      isProtected: true },
  buy_power:       { path: '/tokens/buy?package=power',        isProtected: true },
  buy_pro:         { path: '/tokens/buy?package=pro',          isProtected: true },
  buy_enterprise:  { path: '/tokens/buy?package=enterprise',   isProtected: true },

  // Settings / preferences (sub-tabs are query-driven; SettingsPage falls back
  // to its default tab if the param isn't recognized — graceful degrade).
  settings:        { path: '/settings',                        isProtected: true },
  profile:         { path: '/settings?tab=profile',            isProtected: true },
  language:        { path: '/settings?tab=profile',            isProtected: true },
  preferences:     { path: '/settings?tab=preferences',        isProtected: true },
  appearance:      { path: '/settings?tab=appearance',         isProtected: true },
  notifications:   { path: '/settings?tab=notifications',      isProtected: true },
  security:        { path: '/settings?tab=security',           isProtected: true },

  // Billing / usage / wallet
  usage:           { path: '/usage',                           isProtected: true },
  budget:          { path: '/budget',                          isProtected: true },
  wallet:          { path: '/dashboard',                       isProtected: true },
  transactions:    { path: '/transactions',                    isProtected: true },

  // Team / org (additional role gating happens at the route level — the
  // user just bounces to /dashboard if their role can't see it; that's
  // still better than dropping them on landing).
  team:            { path: '/team',                            isProtected: true },
  org:             { path: '/org',                             isProtected: true },
  org_billing:     { path: '/org/billing',                     isProtected: true },
  org_analytics:   { path: '/org/analytics',                   isProtected: true },

  // Misc
  tasks:           { path: '/tasks',                           isProtected: true },
  sessions:        { path: '/sessions',                        isProtected: true },
  reset_password:  { path: '/reset-password',                  isProtected: false },
  verify_email:    { path: '/verify-email',                    isProtected: false },
}

/**
 * Fuzzy fallback — when the bot emits an unfamiliar action_id, scan its
 * keywords for a near-match. Conservative on purpose: each branch only
 * fires on a clear keyword. Last-ditch fallback is /#pricing because
 * sending the user to a meaningful surface beats a no-op every time.
 */
function fuzzyResolve(actionId: string): ResolvedAction | null {
  const id = actionId.toLowerCase().replace(/[^a-z0-9]+/g, '_')

  // Tokens & purchase
  if (/(buy|purchase|pay).*?(token|pack|plan|credit)|^token|credit|topup|top_up|recharge/.test(id)) {
    return ACTION_ROUTES.buy_tokens
  }
  if (/(starter|5_dollar|5_buck)/.test(id))     return ACTION_ROUTES.buy_starter
  if (/standard|14_dollar|2m/.test(id))          return ACTION_ROUTES.buy_standard
  if (/popular|25_dollar|5m/.test(id))           return ACTION_ROUTES.buy_popular
  if (/power|60_dollar|15m/.test(id))            return ACTION_ROUTES.buy_power
  if (/^pro$|175_dollar|50m/.test(id))           return ACTION_ROUTES.buy_pro
  if (/enterprise|300_dollar|100m/.test(id))     return ACTION_ROUTES.buy_enterprise

  // Auth
  if (/(sign|create).*account|register|signup|join/.test(id))   return ACTION_ROUTES.signup
  if (/^login$|sign_?in|log_?in/.test(id))                       return ACTION_ROUTES.login

  // Settings family
  if (/language|locale|translate/.test(id))      return ACTION_ROUTES.language
  if (/profile|account_info|my_account/.test(id)) return ACTION_ROUTES.profile
  if (/appearance|theme|dark|light/.test(id))    return ACTION_ROUTES.appearance
  if (/notification|email_alert|alert/.test(id)) return ACTION_ROUTES.notifications
  if (/security|password|two_factor|2fa/.test(id)) return ACTION_ROUTES.security
  if (/setting|preference|config/.test(id))      return ACTION_ROUTES.settings

  // Billing / usage
  if (/usage|consumption|stats|analytics/.test(id))      return ACTION_ROUTES.usage
  if (/budget|spend_limit|cap/.test(id))                  return ACTION_ROUTES.budget
  if (/wallet|balance/.test(id))                          return ACTION_ROUTES.wallet
  if (/transaction|history|receipt|invoice/.test(id))     return ACTION_ROUTES.transactions

  // Team / org
  if (/team|member|colleague/.test(id))           return ACTION_ROUTES.team
  if (/org_?billing/.test(id))                    return ACTION_ROUTES.org_billing
  if (/org|organization|company/.test(id))        return ACTION_ROUTES.org

  // Surfaces
  if (/^chat$|conversation/.test(id))             return ACTION_ROUTES.chat
  if (/dashboard|home|overview/.test(id))         return ACTION_ROUTES.dashboard
  if (/^models?$|model_list/.test(id))            return ACTION_ROUTES.models
  if (/api_?key/.test(id))                        return ACTION_ROUTES.api_keys
  if (/api_?doc|developer/.test(id))              return ACTION_ROUTES.api_docs
  if (/feature|capability/.test(id))              return ACTION_ROUTES.features
  if (/how_?it_?work|tutorial|guide/.test(id))    return ACTION_ROUTES.how_it_works
  if (/price|plan|cost/.test(id))                 return ACTION_ROUTES.pricing
  if (/privacy/.test(id))                         return ACTION_ROUTES.privacy
  if (/term|tos|conditions/.test(id))             return ACTION_ROUTES.terms

  return null
}

/**
 * Resolve a bot-emitted action_id to a navigable route. Tries exact match,
 * then fuzzy keyword match, then accepts a path-shaped string as a literal
 * route, then falls back to landing-pricing so the click is never a no-op.
 */
export function resolveActionRoute(actionId: string): ResolvedAction | null {
  if (!actionId) return null
  const normalized = actionId.toLowerCase().trim().replace(/\s+/g, '_').replace(/-/g, '_')

  if (ACTION_ROUTES[normalized]) return ACTION_ROUTES[normalized]

  const fuzzy = fuzzyResolve(normalized)
  if (fuzzy) return fuzzy

  // Path-like literals from the bot — accept as-is but flag as protected if
  // not in our public list, so logged-out users get the redirect treatment.
  if (actionId.startsWith('/')) {
    const isPublic = /^\/(register|login|privacy|terms|reset-password|verify-email|join)(\/|\?|#|$)/.test(actionId)
    return { path: actionId, isProtected: !isPublic }
  }

  // Last-resort: send to landing's pricing section. Public, useful, never empty.
  return { path: '/#pricing', isProtected: false }
}
