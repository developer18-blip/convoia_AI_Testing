import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, RotateCcw, Sparkles } from 'lucide-react'
import { useChatbot, resolveActionRoute } from '../../hooks/useChatbot'
import { useAuth } from '../../hooks/useAuth'
import { ChatbotMessage } from './ChatbotMessage'
import { ChatbotInput } from './ChatbotInput'

/** sessionStorage key picked up by AuthContext after a successful login/
 *  register so the user lands on their intended destination instead of
 *  the default /chat. Lifecycle: set here, consumed once, then cleared. */
export const POST_AUTH_REDIRECT_KEY = 'convoia_post_auth_redirect'

const STORAGE_OPENED_KEY = 'convoia_chatbot_opened_v1'

const STARTER_QUESTIONS = [
  'What is Convoia AI?',
  'How does pricing work?',
  'Which models can I use?',
  'How is this different from ChatGPT?',
]

/**
 * "Convo" — the Convoia visitor chatbot widget.
 *
 * Floating bubble bottom-right; expands into a 380×580 panel. Inherits
 * accent color from AccentContext (turquoise default, shifts to provider
 * theme on /chat or wherever a model is active). Anonymous; calls
 * /api/public/chatbot/stream which is rate-limited per-IP.
 *
 * Mounted once at the App root via main.tsx wrapping. Visibility is
 * controlled by the route filter below — currently shown everywhere
 * since the user opted into "all routes" visibility.
 */
export function ChatbotWidget() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [hasOpenedBefore, setHasOpenedBefore] = useState(() => {
    try { return localStorage.getItem(STORAGE_OPENED_KEY) === '1' } catch { return false }
  })
  const [pendingDraft, setPendingDraft] = useState<string | undefined>(undefined)
  const { messages, isStreaming, sendMessage, reset } = useChatbot()

  // Visibility filter — currently render everywhere per user spec.
  // Edit this to hide on specific routes (e.g. ['/chat']) without touching anything else.
  const HIDE_ON: string[] = []
  const isHidden = HIDE_ON.includes(location.pathname)

  // Auto-scroll to bottom on new chunks
  const listRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  // Esc closes panel
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  const open = () => {
    setIsOpen(true)
    if (!hasOpenedBefore) {
      try { localStorage.setItem(STORAGE_OPENED_KEY, '1') } catch { /* ignore */ }
      setHasOpenedBefore(true)
    }
  }

  const handleStarter = (q: string) => {
    setPendingDraft(q)
  }

  const handleFollowup = (q: string) => {
    setPendingDraft(q)
  }

  /**
   * Auth-aware CTA navigation. The bot emits an action_id; we resolve it to
   * a route + protection flag, then route based on auth state:
   *
   *   - Public route        -> navigate directly
   *   - Hash anchor         -> navigate to /, smooth-scroll to section
   *   - External http(s)    -> full-page window.location
   *   - Protected + auth'd  -> navigate directly
   *   - Protected + anon    -> stash destination in sessionStorage, send to
   *                            /register; AuthContext consumes the stash
   *                            after login and lands the user on the
   *                            originally-requested page (so "Buy tokens"
   *                            from a logged-out visit ends on /tokens/buy
   *                            after signup, not the default /chat).
   */
  const handleCtaNavigate = (actionId: string) => {
    const action = resolveActionRoute(actionId)
    if (!action) {
      // resolveActionRoute returns at worst /#pricing, so this branch is
      // defensive only. Keep the widget open so the user can ask again.
      return
    }
    const { path, isProtected } = action

    if (path.startsWith('http')) {
      window.location.href = path
      return
    }

    if (path.startsWith('/#')) {
      const id = path.slice(2).split('?')[0]
      // If we're already on landing, just scroll. Otherwise route + scroll.
      if (location.pathname === '/') {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      } else {
        navigate('/')
        setTimeout(() => {
          const el = document.getElementById(id)
          if (el) el.scrollIntoView({ behavior: 'smooth' })
        }, 120)
      }
      setIsOpen(false)
      return
    }

    if (isProtected && !isAuthenticated) {
      try { sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, path) } catch { /* ignore quota */ }
      navigate('/register', { state: { from: path } })
      setIsOpen(false)
      return
    }

    navigate(path)
    setIsOpen(false)
  }

  if (isHidden) return null

  return (
    <>
      {/* Bubble (collapsed) */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="chatbot-bubble"
            onClick={open}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            aria-label="Open Convoia chatbot"
            style={{
              position: 'fixed',
              right: 'max(20px, env(safe-area-inset-right))',
              bottom: 'max(20px, env(safe-area-inset-bottom))',
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--color-primary, #14B8CD)',
              color: 'var(--provider-on, #ffffff)',
              cursor: 'pointer',
              zIndex: 9000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 24px var(--color-primary-glow), 0 2px 6px rgba(0,0,0,0.15)',
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {!hasOpenedBefore && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: 'var(--color-primary, #14B8CD)',
                  animation: 'chatbot-pulse 1.8s ease-out 3',
                  pointerEvents: 'none',
                }}
              />
            )}
            <Sparkles size={22} strokeWidth={2.2} style={{ position: 'relative' }} />
            {/* "New" indicator dot before first open */}
            {!hasOpenedBefore && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#fff',
                  border: '2px solid var(--color-primary, #14B8CD)',
                }}
              />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel (expanded) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chatbot-panel"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            role="dialog"
            aria-label="Convoia chatbot"
            style={{
              position: 'fixed',
              right: 'max(20px, env(safe-area-inset-right))',
              bottom: 'max(20px, env(safe-area-inset-bottom))',
              width: 'min(380px, calc(100vw - 32px))',
              height: 'min(580px, calc(100vh - 80px))',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 18,
              zIndex: 9000,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 12px 48px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px var(--color-primary-glow)',
              transformOrigin: 'bottom right',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 12px 12px 14px',
                borderBottom: '1px solid var(--color-border-subtle)',
                background: 'linear-gradient(180deg, var(--color-primary-light) 0%, var(--color-surface) 100%)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--color-primary, #14B8CD)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--provider-on, #ffffff)',
                  boxShadow: '0 0 0 3px var(--color-primary-glow)',
                  flexShrink: 0,
                }}
              >
                <Sparkles size={15} strokeWidth={2.4} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Convo</span>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#22c55e',
                      boxShadow: '0 0 6px rgba(34,197,94,0.6)',
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  Convoia helper · Always free
                </div>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={reset}
                  aria-label="Clear conversation"
                  title="Clear conversation"
                  style={iconBtnStyle}
                >
                  <RotateCcw size={14} strokeWidth={2.2} />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Minimize chatbot"
                title="Minimize"
                style={iconBtnStyle}
              >
                <ChevronDown size={16} strokeWidth={2.2} />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={listRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '14px 12px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
              className="chatbot-scroll"
            >
              {messages.length === 0 ? (
                <ChatbotWelcome onPick={handleStarter} />
              ) : (
                messages.map((m) => (
                  <ChatbotMessage
                    key={m.id}
                    message={m}
                    onFollowupClick={handleFollowup}
                    onCtaNavigate={handleCtaNavigate}
                  />
                ))
              )}
            </div>

            {/* Input */}
            <ChatbotInput
              onSend={sendMessage}
              isStreaming={isStreaming}
              draft={pendingDraft}
              onDraftConsumed={() => setPendingDraft(undefined)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global styles for animations + markdown spacing.
          Inline so the widget is fully self-contained (no extra CSS file). */}
      <style>{CHATBOT_GLOBAL_CSS}</style>
    </>
  )
}

const iconBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 28,
  height: 28,
  borderRadius: 8,
  background: 'transparent',
  border: 'none',
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 100ms ease, color 100ms ease',
}

function ChatbotWelcome({ onPick }: { onPick: (q: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 0' }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--color-primary, #14B8CD)',
            color: 'var(--provider-on, #ffffff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 0 4px var(--color-primary-glow)',
          }}
        >
          <Sparkles size={18} strokeWidth={2.4} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Hey, I'm Convo 👋
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Ask me anything about Convoia AI.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {STARTER_QUESTIONS.map((q) => (
          <motion.button
            key={q}
            onClick={() => onPick(q)}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            whileHover={{ x: 2 }}
            style={{
              textAlign: 'left',
              padding: '10px 12px',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 10,
              color: 'var(--color-text-primary)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 120ms ease, border-color 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-primary-light)'
              e.currentTarget.style.borderColor = 'var(--color-primary, #14B8CD)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-2)'
              e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
            }}
          >
            {q}
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

const CHATBOT_GLOBAL_CSS = `
  @keyframes chatbot-pulse {
    0% { transform: scale(1); opacity: 0.5; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  @keyframes chatbot-blink {
    0% { opacity: 1; }
    50% { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes chatbot-typing {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-3px); opacity: 1; }
  }
  .chatbot-scroll::-webkit-scrollbar { width: 6px; }
  .chatbot-scroll::-webkit-scrollbar-track { background: transparent; }
  .chatbot-scroll::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }
  .chatbot-scroll::-webkit-scrollbar-thumb:hover { background: var(--color-border-hover); }
  .chatbot-md p { margin: 0 0 8px; }
  .chatbot-md p:last-child { margin-bottom: 0; }
  .chatbot-md ul, .chatbot-md ol { margin: 4px 0 8px; padding-left: 20px; }
  .chatbot-md li { margin-bottom: 2px; font-size: 13.5px; }
  .chatbot-md a { color: var(--color-primary, #14B8CD); text-decoration: underline; text-underline-offset: 2px; }
  .chatbot-md code { background: var(--color-surface-3); padding: 1px 5px; border-radius: 4px; font-size: 12px; font-family: ui-monospace, monospace; }
  .chatbot-md pre { background: var(--color-background); border: 1px solid var(--color-border-subtle); padding: 8px 10px; border-radius: 8px; overflow-x: auto; margin: 6px 0 8px; }
  .chatbot-md pre code { background: transparent; padding: 0; font-size: 12px; }
  .chatbot-md table { border-collapse: collapse; margin: 6px 0; font-size: 12.5px; width: 100%; }
  .chatbot-md th, .chatbot-md td { border: 1px solid var(--color-border-subtle); padding: 4px 8px; text-align: left; }
  .chatbot-md th { background: var(--color-surface-3); font-weight: 600; }
  .chatbot-md strong { color: var(--color-text-primary); font-weight: 600; }
  .chatbot-md h1, .chatbot-md h2, .chatbot-md h3 { font-size: 14px; font-weight: 600; margin: 10px 0 4px; }
  .chatbot-md h1:first-child, .chatbot-md h2:first-child, .chatbot-md h3:first-child { margin-top: 0; }
  .chatbot-md hr { border: none; border-top: 1px solid var(--color-border-subtle); margin: 10px 0; }
`

export default ChatbotWidget
