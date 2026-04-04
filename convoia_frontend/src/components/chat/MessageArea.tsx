import { useEffect, useRef, useState } from 'react'
import { Pencil, Code2, Search, BarChart3, ArrowDown } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../../types'

interface MessageAreaProps {
  messages: Message[]
  isLoading?: boolean
  onRetry?: () => void
  onSuggestedPrompt?: (prompt: string) => void
  onEditMessage?: (id: string, content: string) => void
  onDeleteMessage?: (id: string) => void
  onRunCode?: (code: string, language: string) => void
  onOpenInCanvas?: (content: string, language: string, type: 'code' | 'text') => void
}

const suggestions = [
  { icon: <Pencil size={16} style={{ color: 'var(--color-primary)' }} />, title: 'Write something', prompt: 'Help me write a professional email to request a project deadline extension' },
  { icon: <Code2 size={16} style={{ color: 'var(--color-primary)' }} />, title: 'Code something', prompt: 'Write a Python script to analyze CSV data and generate summary statistics' },
  { icon: <Search size={16} style={{ color: 'var(--color-primary)' }} />, title: 'Research something', prompt: 'Compare the top 5 cloud providers for deploying a Node.js application' },
  { icon: <BarChart3 size={16} style={{ color: 'var(--color-primary)' }} />, title: 'Analyze something', prompt: 'Explain how transformer models work in natural language processing' },
]

export function MessageArea({ messages, isLoading, onRetry, onSuggestedPrompt, onEditMessage, onDeleteMessage, onRunCode, onOpenInCanvas }: MessageAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const lastScrollTime = useRef(0)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Detect if user scrolled away from bottom
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      // User is "at bottom" if within 150px
      userScrolledUp.current = distanceFromBottom > 150
      setShowScrollBtn(distanceFromBottom > 300)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Reset scroll lock when streaming ends or new message sent
  useEffect(() => {
    if (!isLoading) userScrolledUp.current = false
  }, [isLoading])

  // Scroll to bottom when new message is ADDED
  const prevMsgCount = useRef(messages.length)
  useEffect(() => {
    if (messages.length !== prevMsgCount.current) {
      prevMsgCount.current = messages.length
      userScrolledUp.current = false
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }
  }, [messages.length])

  // During streaming: auto-scroll ONLY if user hasn't scrolled up
  useEffect(() => {
    if (!isLoading || userScrolledUp.current) return
    const now = Date.now()
    if (now - lastScrollTime.current > 250) {
      lastScrollTime.current = now
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, messages.length, messages[messages.length - 1]?.content?.length])

  if (messages.length === 0) {
    return (
      <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px 120px', backgroundColor: 'var(--chat-bg)' }}>
        {/* Welcome heading — big, clean, ChatGPT-style */}
        <div style={{ animation: 'fade-in 0.4s ease-out', textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px', margin: '0 auto 20px',
            background: 'linear-gradient(135deg, var(--color-primary-light), rgba(16,163,127,0.05))',
            border: '1px solid rgba(16,163,127,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', color: 'var(--color-primary)',
          }}>✦</div>
          <h2 style={{
            fontSize: '26px', fontWeight: 700, letterSpacing: '-0.5px',
            color: 'var(--color-text-primary)', margin: 0,
          }}>
            How can I help you today?
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            Choose a suggestion or type your message below
          </p>
        </div>

        {/* Suggestion cards — responsive 2x2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', width: '100%', maxWidth: '680px', animation: 'slideUp 0.5s ease-out' }}>
          {suggestions.map((s, i) => (
            <button key={s.title} onClick={() => onSuggestedPrompt?.(s.prompt)}
              className="suggestion-card"
              style={{
                padding: '16px 18px', backgroundColor: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
                borderRadius: '16px', cursor: 'pointer', textAlign: 'left',
                animationDelay: `${i * 60}ms`, animationFillMode: 'backwards',
                animation: `fadeSlideIn 0.3s ease-out ${i * 60}ms backwards`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-hover)'; e.currentTarget.style.borderColor = 'var(--color-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-surface)'; e.currentTarget.style.borderColor = 'var(--chat-border)' }}>
              <div style={{ marginBottom: '10px' }}>{s.icon}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>{s.title}</div>
              <p style={{ fontSize: '12.5px', color: 'var(--color-text-muted)', margin: 0, lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{s.prompt}</p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <div ref={containerRef} className="chat-messages-container" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', backgroundColor: 'var(--chat-bg)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '16px 12px 0', width: '100%' }}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg}
              onRetry={msg.error ? onRetry : undefined}
              onEdit={onEditMessage} onDelete={onDeleteMessage} onRunCode={onRunCode}
              onOpenInCanvas={onOpenInCanvas} />
          ))}
          <div ref={bottomRef} style={{ height: '20px' }} />
        </div>
      </div>

      {/* Scroll to bottom button — positioned outside scroll container so it stays fixed */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="scroll-btn-enter"
          aria-label="Scroll to bottom"
          style={{
            position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
            color: 'var(--color-text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.2)', transition: 'background 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s',
            zIndex: 10, backdropFilter: 'blur(8px)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(16,163,127,0.3)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--chat-surface)'; e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.borderColor = 'var(--chat-border)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.2)' }}
        >
          <ArrowDown size={18} />
        </button>
      )}
    </div>
  )
}
