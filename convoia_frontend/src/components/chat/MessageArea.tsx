import { useEffect, useRef } from 'react'
import { Sparkles, Pencil, Code2, Search, BarChart3 } from 'lucide-react'
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
}

const suggestions = [
  { icon: <Pencil size={16} style={{ color: 'var(--color-primary)' }} />, title: 'Write something', prompt: 'Help me write a professional email to request a project deadline extension' },
  { icon: <Code2 size={16} style={{ color: 'var(--color-primary)' }} />, title: 'Code something', prompt: 'Write a Python script to analyze CSV data and generate summary statistics' },
  { icon: <Search size={16} style={{ color: 'var(--color-primary)' }} />, title: 'Research something', prompt: 'Compare the top 5 cloud providers for deploying a Node.js application' },
  { icon: <BarChart3 size={16} style={{ color: 'var(--color-primary)' }} />, title: 'Analyze something', prompt: 'Explain how transformer models work in natural language processing' },
]

export function MessageArea({ messages, isLoading, onRetry, onSuggestedPrompt, onEditMessage, onDeleteMessage, onRunCode }: MessageAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when new message arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.content])

  // Also scroll when AI is streaming/typing
  useEffect(() => {
    if (isLoading) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isLoading])

  if (messages.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', backgroundColor: 'var(--chat-bg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '55vh', gap: '0' }}>
          {/* Logo mark */}
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%',
            backgroundColor: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '20px',
          }}>
            <Sparkles size={24} style={{ color: 'white' }} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.5px', marginBottom: '8px', textAlign: 'center' }}>
            Convoia AI
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '32px' }}>
            How can I help you today?
          </p>

          {/* Suggestion cards — 2x2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', maxWidth: '460px' }}>
            {suggestions.map((s) => (
              <button key={s.title} onClick={() => onSuggestedPrompt?.(s.prompt)}
                style={{
                  padding: '16px', backgroundColor: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
                  borderRadius: '12px', cursor: 'pointer', textAlign: 'left', transition: 'all 180ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-border)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-surface)' }}>
                <div style={{ fontSize: '18px', marginBottom: '8px' }}>{s.icon}</div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '4px' }}>{s.title}</div>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.prompt}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="chat-messages-container" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', backgroundColor: 'var(--chat-bg)' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '20px 20px 0', width: '100%' }}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg}
            onRetry={msg.error ? onRetry : undefined}
            onEdit={onEditMessage} onDelete={onDeleteMessage} onRunCode={onRunCode} />
        ))}
        <div ref={bottomRef} style={{ height: '20px' }} />
      </div>
    </div>
  )
}
