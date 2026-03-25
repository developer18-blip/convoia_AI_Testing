import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertCircle, RefreshCw, Copy, Check, Pencil, Trash2, ThumbsUp, ThumbsDown, Download, FileText, Music, PanelRight } from 'lucide-react'
import { CodeBlock } from './CodeBlock'
import { AgentPanel } from './AgentPanel'
import { InlineChart, extractCharts } from './InlineChart'
import { formatCurrency, formatTokens } from '../../lib/utils'
import type { Message } from '../../types'
import type { ComponentPropsWithoutRef } from 'react'

interface MessageBubbleProps {
  message: Message
  onRetry?: () => void
  onEdit?: (id: string, content: string) => void
  onDelete?: (id: string) => void
  onCopy?: (content: string) => void
  onRunCode?: (code: string, language: string) => void
  onOpenInCanvas?: (content: string, language: string, type: 'code' | 'text') => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function downloadImage(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = 'generated-image.png'
  a.target = '_blank'
  a.click()
}

export function MessageBubble({ message, onRetry, onEdit, onDelete, onCopy, onRunCode, onOpenInCanvas }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(message.content)
  const [showActions, setShowActions] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopy?.(message.content)
  }

  const handleSaveEdit = () => {
    if (editValue.trim() && editValue !== message.content) {
      onEdit?.(message.id, editValue.trim())
    }
    setIsEditing(false)
  }

  /* ── Loading ── */
  if (message.isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '32px', animation: 'fadeSlideIn 200ms ease-out' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
          backgroundColor: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', color: 'white',
        }}>✦</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {message.statusText && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              <div style={{ width: '16px', height: '16px', border: '2px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              {message.statusText}
            </div>
          )}
          {!message.statusText && (
            <div style={{ display: 'flex', gap: '4px', padding: '4px 0' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: 'var(--color-primary)',
                  animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
                }} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── Error ── */
  if (message.error) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '32px', animation: 'fadeSlideIn 200ms ease-out' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
          background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AlertCircle size={14} style={{ color: '#EF4444' }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--chat-text)', margin: 0 }}>{message.error}</p>
          {onRetry && (
            <button onClick={onRetry}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', marginTop: '8px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <RefreshCw size={12} /> Try again
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ── USER MESSAGE — pill on right, no avatar ── */
  if (isUser) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'flex-end', marginBottom: '24px',
        animation: 'fadeSlideIn 200ms ease-out',
      }}
      onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>
        <div style={{ position: 'relative', maxWidth: '60%' }}>
          {/* Hover actions */}
          {showActions && !isEditing && (
            <div style={{
              position: 'absolute', top: '-32px', right: 0,
              display: 'flex', alignItems: 'center', gap: '2px', borderRadius: '8px', padding: '2px',
              background: 'var(--chat-surface)', border: '1px solid var(--chat-border)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 10,
            }}>
              {([
                { show: true, action: handleCopy, icon: copied ? <Check size={13} style={{ color: 'var(--color-primary)' }} /> : <Copy size={13} />, title: 'Copy' },
                { show: !!onEdit, action: () => setIsEditing(true), icon: <Pencil size={13} />, title: 'Edit' },
                { show: !!onDelete, action: () => onDelete!(message.id), icon: <Trash2 size={13} />, title: 'Delete' },
              ] as const).filter(b => b.show).map((btn, i) => (
                <button key={i} onClick={btn.action} title={btn.title}
                  style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: 'transparent', border: 'none', color: 'var(--chat-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 150ms' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-border)'; e.currentTarget.style.color = 'var(--chat-text)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--chat-text-muted)' }}>
                  {btn.icon}
                </button>
              ))}
            </div>
          )}

          {/* User bubble */}
          <div className="user-message-bubble" style={{
            background: 'var(--chat-user-bubble)', borderRadius: '18px', padding: '12px 18px',
            fontSize: '15px', lineHeight: '1.6', color: 'var(--chat-text)', wordBreak: 'break-word',
          }}>
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus
                  style={{ width: '100%', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', resize: 'none', minHeight: '60px', background: 'var(--chat-border)', border: '1px solid var(--color-border-hover)', color: 'var(--chat-text)', outline: 'none' }} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleSaveEdit} style={{ padding: '4px 12px', fontSize: '12px', color: 'white', borderRadius: '8px', background: 'var(--color-primary)', border: 'none', cursor: 'pointer' }}>Save & Resend</button>
                  <button onClick={() => { setIsEditing(false); setEditValue(message.content) }}
                    style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '8px', background: 'var(--chat-border)', color: 'var(--chat-text-secondary)', border: 'none', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {/* Image preview */}
                {message.imagePreview && (
                  <div style={{ marginBottom: '8px' }}>
                    <img src={message.imagePreview} alt="Uploaded" style={{ maxWidth: '320px', maxHeight: '256px', borderRadius: '12px', border: '1px solid var(--chat-border)', objectFit: 'cover' }} />
                  </div>
                )}
                {/* File chips */}
                {message.fileAttachment && message.fileAttachment.type === 'document' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--chat-border)', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', fontSize: '13px', color: 'var(--chat-text)' }}>
                    <FileText size={14} /><span>{message.fileAttachment.name}</span>
                    <span style={{ color: 'var(--chat-text-muted)', fontSize: '11px' }}>{formatFileSize(message.fileAttachment.size)}</span>
                  </div>
                )}
                {message.fileAttachment && message.fileAttachment.type === 'audio' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--chat-border)', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', fontSize: '13px', color: 'var(--chat-text)' }}>
                    <Music size={14} /><span>{message.fileAttachment.name}</span>
                  </div>
                )}
                {message.content}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ── AI MESSAGE — no bubble, text flows on dark bg ── */
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '32px',
      animation: 'fadeSlideIn 200ms ease-out',
    }}
    onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>

      {/* AI Avatar */}
      <div style={{
        width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
        backgroundColor: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '14px', color: 'white',
      }}>✦</div>

      {/* Text area — no background, no border */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>

        {/* Web Search Card */}
        {message.webSearch && (
          <div style={{
            marginBottom: '16px', padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(16,185,129,0.06))',
            border: '1px solid rgba(124,58,237,0.15)',
            borderRadius: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '6px',
                background: 'linear-gradient(135deg, #7C3AED, #10B981)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', color: 'white',
              }}>🔍</div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Searched the web
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', fontStyle: 'italic' }}>
                "{message.webSearch.query}"
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {message.webSearch.sources.map((source, idx) => {
                let domain = ''
                try { domain = new URL(source.url).hostname.replace('www.', '') } catch { domain = source.url }
                return (
                  <a
                    key={idx}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '4px 10px', borderRadius: '8px',
                      background: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
                      fontSize: '11px', color: 'var(--color-text-secondary)',
                      textDecoration: 'none', transition: 'all 0.15s',
                      maxWidth: '200px',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--chat-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                      width={14} height={14} alt=""
                      style={{ borderRadius: '2px', flexShrink: 0 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        <div className="prose prose-sm max-w-none message-content" style={{ fontSize: '15px', lineHeight: '1.75', color: 'var(--chat-text)' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p style={{ marginBottom: '16px', lineHeight: '1.75', color: 'var(--chat-text)' }} className="last:mb-0">{children}</p>,
              h1: ({ children }) => <h1 className="first:mt-0" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--chat-text)', marginBottom: '12px', marginTop: '24px' }}>{children}</h1>,
              h2: ({ children }) => <h2 className="first:mt-0" style={{ fontSize: '17px', fontWeight: 600, color: 'var(--chat-text)', marginBottom: '10px', marginTop: '20px' }}>{children}</h2>,
              h3: ({ children }) => <h3 className="first:mt-0" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--chat-text)', marginBottom: '8px', marginTop: '16px' }}>{children}</h3>,
              ul: ({ children }) => <ul style={{ paddingLeft: '24px', marginBottom: '16px', listStyleType: 'disc' }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ paddingLeft: '24px', marginBottom: '16px', listStyleType: 'decimal' }}>{children}</ol>,
              li: ({ children }) => <li style={{ marginBottom: '6px', lineHeight: '1.65', color: 'var(--chat-text)' }}>{children}</li>,
              blockquote: ({ children }) => (
                <blockquote style={{
                  borderLeft: '3px solid var(--chat-border)', paddingLeft: '16px',
                  margin: '16px 0', color: 'var(--chat-text-secondary)', fontStyle: 'italic',
                }}>{children}</blockquote>
              ),
              strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{children}</strong>,
              em: ({ children }) => <em style={{ color: 'var(--chat-text-secondary)', fontStyle: 'italic' }}>{children}</em>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>{children}</a>
              ),
              hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--chat-border)', margin: '20px 0' }} />,
              table: ({ children }) => (
                <div className="table-wrapper" style={{ margin: '16px 0', overflow: 'auto', borderRadius: '8px', border: '1px solid var(--chat-border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th style={{
                  backgroundColor: 'var(--chat-surface)', padding: '10px 14px', textAlign: 'left',
                  fontWeight: 600, color: 'var(--chat-text)', borderBottom: '1px solid var(--chat-border)', fontSize: '13px',
                }}>{children}</th>
              ),
              td: ({ children }) => (
                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--chat-surface)', color: 'var(--chat-text-secondary)' }}>{children}</td>
              ),
              img: ({ src, alt }) => (
                <div style={{ margin: '16px 0' }}>
                  <img src={src} alt={alt || 'Generated image'}
                    style={{ maxWidth: '100%', maxHeight: '512px', borderRadius: '12px', border: '1px solid var(--chat-border)', objectFit: 'contain', cursor: 'pointer' }}
                    onClick={() => { if (src) window.open(src, '_blank') }}
                  />
                  {alt && alt !== 'Generated image' && alt !== 'Generated Image' && (
                    <p style={{ fontSize: '12px', color: 'var(--chat-text-muted)', marginTop: '6px', fontStyle: 'italic' }}>{alt}</p>
                  )}
                </div>
              ),
              code(props: ComponentPropsWithoutRef<'code'> & { inline?: boolean; className?: string }) {
                const { inline, className, children, ...rest } = props
                const match = /language-(\w+)/.exec(className || '')
                if (!inline && match) {
                  return <CodeBlock language={match[1]}
                    onRun={onRunCode ? () => onRunCode(String(children).replace(/\n$/, ''), match[1]) : undefined}
                    onOpenInCanvas={onOpenInCanvas ? (code, lang) => onOpenInCanvas(code, lang, 'code') : undefined}>
                    {String(children).replace(/\n$/, '')}
                  </CodeBlock>
                }
                return (
                  <code style={{
                    backgroundColor: 'var(--chat-surface)', color: 'var(--chat-text)',
                    padding: '1px 6px', borderRadius: '4px', fontSize: '13.5px',
                    fontFamily: "'Fira Code', monospace", border: '1px solid var(--chat-border)',
                  }} {...rest}>{children}</code>
                )
              },
            }}
          >
            {(() => { const { cleanText } = extractCharts(message.content); return cleanText || message.content; })()}
          </ReactMarkdown>

          {/* Inline Charts */}
          {(() => { const { charts } = extractCharts(message.content); return charts.map((chart, i) => <InlineChart key={i} chart={chart} />); })()}
        </div>

        {/* Generated image */}
        {message.imageUrl && (
          <div style={{ marginTop: '12px' }}>
            <img src={message.imageUrl} alt={message.imagePrompt || 'Generated image'}
              style={{ maxWidth: '384px', borderRadius: '12px', cursor: 'pointer', border: '1px solid var(--chat-border)' }} />
            {message.imagePrompt && (
              <p style={{ fontSize: '12px', marginTop: '4px', fontStyle: 'italic', color: 'var(--chat-text-muted)' }}>"{message.imagePrompt}"</p>
            )}
            <button onClick={() => downloadImage(message.imageUrl!)}
              style={{ marginTop: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Download size={12} /> Download image
            </button>
          </div>
        )}

        {/* File attachment */}
        {message.fileAttachment && (
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', background: 'var(--chat-surface)', border: '1px solid var(--chat-border)', color: 'var(--chat-text-secondary)' }}>
            <FileText size={14} /><span>{message.fileAttachment.name}</span>
            <span style={{ color: 'var(--chat-text-muted)' }}>{formatFileSize(message.fileAttachment.size)}</span>
          </div>
        )}

        {/* Agent run */}
        {message.agentRun && <div style={{ marginTop: '12px' }}><AgentPanel agentRun={message.agentRun} /></div>}

        {/* Try with another model — lazy execution */}
        {showActions && message.content.length > 20 && onRetry && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px',
            opacity: showActions ? 1 : 0, transition: 'opacity 200ms',
          }}>
            {[
              { label: 'GPT-5.4', color: '#10B981' },
              { label: 'Claude 4.6', color: '#D97706' },
              { label: 'Gemini Pro', color: '#3B82F6' },
            ].filter(m => !message.model?.includes(m.label.split(' ')[0])).slice(0, 2).map(m => (
              <button key={m.label}
                style={{
                  fontSize: '11px', padding: '3px 10px', borderRadius: '12px',
                  border: `1px solid ${m.color}30`, background: `${m.color}08`,
                  color: m.color, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${m.color}18`; e.currentTarget.style.borderColor = `${m.color}50` }}
                onMouseLeave={e => { e.currentTarget.style.background = `${m.color}08`; e.currentTarget.style.borderColor = `${m.color}30` }}
                title={`Regenerate this response with ${m.label}`}
              >
                Try {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Meta + action buttons */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px',
          opacity: showActions ? 1 : 0, transition: 'opacity 150ms',
        }}>
          {([
            { show: true, action: handleCopy, icon: copied ? <Check size={13} style={{ color: 'var(--color-primary)' }} /> : <Copy size={13} />, title: 'Copy' },
            { show: !!onOpenInCanvas && message.content.length > 100, action: () => onOpenInCanvas!(message.content, 'markdown', 'text'), icon: <PanelRight size={13} />, title: 'Open in Canvas' },
            { show: !!onRetry, action: onRetry!, icon: <RefreshCw size={13} />, title: 'Regenerate' },
            { show: true, action: () => {}, icon: <ThumbsUp size={13} />, title: 'Good' },
            { show: true, action: () => {}, icon: <ThumbsDown size={13} />, title: 'Bad' },
            { show: !!onDelete, action: () => onDelete!(message.id), icon: <Trash2 size={13} />, title: 'Delete' },
          ] as const).filter(b => b.show).map((btn, i) => (
            <button key={i} onClick={btn.action} title={btn.title}
              style={{
                padding: '4px 8px', borderRadius: '6px', backgroundColor: 'transparent',
                border: 'none', color: 'var(--chat-text-muted)', cursor: 'pointer', fontSize: '12px',
                display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-surface)'; e.currentTarget.style.color = 'var(--chat-text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--chat-text-muted)' }}>
              {btn.icon}
            </button>
          ))}

          {message.cost !== undefined && message.cost > 0 && (
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--chat-text-dim)' }}>{formatCurrency(message.cost)}</span>
          )}
          {message.tokensInput !== undefined && message.tokensInput > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--chat-text-dim)' }}>
              {formatTokens((message.tokensInput || 0) + (message.tokensOutput || 0))} tokens
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
