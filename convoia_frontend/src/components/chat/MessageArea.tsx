import { useEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { WelcomeScreen } from './WelcomeScreen'
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

export function MessageArea({ messages, isLoading, onRetry, onSuggestedPrompt, onEditMessage, onDeleteMessage, onRunCode, onOpenInCanvas }: MessageAreaProps) {
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
      <div style={{ height: '100%', overflowY: 'auto', backgroundColor: 'var(--chat-bg)' }}>
        <WelcomeScreen onSuggestionClick={(prompt) => onSuggestedPrompt?.(prompt)} />
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
