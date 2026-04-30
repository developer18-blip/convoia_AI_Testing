import { useEffect, useRef, useState, useMemo } from 'react'
import { Pencil, Code2, Search, BarChart3, ArrowDown } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { IntellectMark } from '../brand/IntellectMark'
import { useAuth } from '../../hooks/useAuth'
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

const SUGGESTIONS = [
  { key: 'write', color: 'pink', rgb: '236, 72, 153', Icon: Pencil, title: 'Write', description: 'Draft an email, write a blog post, or craft a message', prompt: 'Help me write a professional email to request a project deadline extension' },
  { key: 'code', color: 'blue', rgb: '59, 130, 246', Icon: Code2, title: 'Code', description: 'Debug, refactor, or build something from scratch', prompt: 'Write a Python script to analyze CSV data and generate summary statistics' },
  { key: 'research', color: 'green', rgb: '16, 185, 129', Icon: Search, title: 'Research', description: 'Compare options, gather insights, or explore a topic', prompt: 'Compare the top 5 cloud providers for deploying a Node.js application' },
  { key: 'analyze', color: 'orange', rgb: '245, 158, 11', Icon: BarChart3, title: 'Analyze', description: 'Break down data, explain concepts, or review files', prompt: 'Explain how transformer models work in natural language processing' },
] as const

function getTimeGreeting(firstName: string): string {
  const hour = new Date().getHours()
  if (hour < 5) return `Still up, ${firstName}?`
  if (hour < 12) return `Good morning, ${firstName}`
  if (hour < 17) return `Good afternoon, ${firstName}`
  if (hour < 22) return `Good evening, ${firstName}`
  return `Working late, ${firstName}?`
}

export function MessageArea({ messages, isLoading, onRetry, onSuggestedPrompt, onEditMessage, onDeleteMessage, onRunCode, onOpenInCanvas }: MessageAreaProps) {
  const { user } = useAuth()
  const firstName = useMemo(() => user?.name?.trim().split(/\s+/)[0] || 'there', [user?.name])
  const greeting = useMemo(() => getTimeGreeting(firstName), [firstName])
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
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
      // Show scroll button earlier on mobile (100px vs 300px)
      setShowScrollBtn(distanceFromBottom > 100)
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

  // During streaming: auto-scroll on an interval while loading
  useEffect(() => {
    if (!isLoading || userScrolledUp.current) return
    // Immediately scroll once
    bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
    // Then keep scrolling every 200ms while streaming
    const interval = setInterval(() => {
      if (!userScrolledUp.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
      }
    }, 200)
    return () => clearInterval(interval)
  }, [isLoading])

  if (messages.length === 0) {
    return (
      <div className="chat-welcome" style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px 120px', backgroundColor: 'var(--chat-bg)' }}>
        {/* Hybrid icon — purple gradient frame with Intellect Mark inside */}
        <div className="chat-welcome__icon" style={{
          width: '72px', height: '72px', borderRadius: '20px', marginBottom: '20px',
          background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 40px rgba(124, 58, 237, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
          animation: 'float 6s ease-in-out infinite',
        }}>
          <IntellectMark size={38} state="idle" color="#ffffff" />
        </div>

        {/* Eyebrow label */}
        <div className="mono-label" style={{ color: '#a78bfa', marginBottom: '12px', letterSpacing: '0.8px', fontSize: 11 }}>
          CHAT WITH INTELLECT AI
        </div>

        {/* Time-aware greeting */}
        <h1 style={{
          fontSize: '32px', fontWeight: 600, letterSpacing: '-0.025em',
          margin: '0 0 8px', textAlign: 'center', color: 'var(--color-text-primary)',
          animation: 'fade-in 0.4s ease-out',
        }}>
          {greeting}
        </h1>
        <p style={{ fontSize: 'var(--text-body, 14px)', color: 'var(--color-text-secondary)', margin: '0 0 40px', textAlign: 'center' }}>
          What would you like to explore today?
        </p>

        {/* 4 suggestion cards with original pink/blue/green/orange colors */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', width: '100%', maxWidth: '680px' }}>
          {SUGGESTIONS.map((s, i) => (
            <button key={s.key} onClick={() => onSuggestedPrompt?.(s.prompt)}
              className={`suggestion-card suggestion-card--${s.color}`}
              style={{
                padding: '18px 20px', backgroundColor: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
                borderRadius: '16px', cursor: 'pointer', textAlign: 'left',
                display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '120px',
                transition: 'transform 200ms ease, box-shadow 200ms ease, background-color 150ms',
                animation: `fadeSlideIn 0.3s ease-out ${i * 60}ms backwards`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-hover)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-surface)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                backgroundColor: `rgba(${s.rgb}, 0.12)`,
                border: `0.5px solid rgba(${s.rgb}, 0.2)`,
                color: `rgb(${s.rgb})`,
              }}>
                <s.Icon size={16} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{s.title}</div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                {s.description}
              </p>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="mono" style={{ marginTop: '32px', fontSize: '11px', color: 'var(--color-text-tertiary, var(--color-text-muted))', display: 'flex', gap: '8px', letterSpacing: '0.3px' }}>
          <span>Drop a file anywhere</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>or start typing below</span>
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
          <div ref={bottomRef} style={{ height: '80px' }} />
        </div>
      </div>

      {/* Scroll to bottom button — positioned outside scroll container so it stays fixed */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="scroll-btn-enter"
          aria-label="Scroll to bottom"
          style={{
            position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'var(--color-primary)', border: 'none',
            color: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(124,58,237,0.4)', transition: 'all 0.2s',
            zIndex: 10,
          }}
        >
          <ArrowDown size={20} />
        </button>
      )}
    </div>
  )
}
