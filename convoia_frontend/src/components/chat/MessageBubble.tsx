import { useState, useRef, useEffect, useMemo, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { AlertCircle, RefreshCw, Copy, Check, Pencil, Trash2, ThumbsUp, ThumbsDown, Download, FileText, Music, PanelRight } from 'lucide-react'
import { CodeBlock } from './CodeBlock'
import { AgentPanel } from './AgentPanel'
import { InlineChart, extractCharts } from './InlineChart'
import { DocumentDownloadBar } from './DocumentDownloadBar'
import { isDocumentWorthy } from '../../lib/documentDetector'
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

export const MessageBubble = memo(function MessageBubble({ message, onRetry, onEdit, onDelete, onCopy, onRunCode, onOpenInCanvas }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(message.content)
  const [showActions, setShowActions] = useState(false)
  const [showFullUserMsg, setShowFullUserMsg] = useState(false)

  // Debounce markdown rendering during streaming to prevent jitter
  const [renderedContent, setRenderedContent] = useState(message.content)
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (message.isLoading) {
      // During streaming: batch updates every 150ms
      if (renderTimer.current) clearTimeout(renderTimer.current)
      renderTimer.current = setTimeout(() => {
        setRenderedContent(message.content)
      }, 150)
    } else {
      // Not streaming: render immediately
      if (renderTimer.current) clearTimeout(renderTimer.current)
      setRenderedContent(message.content)
    }
    return () => { if (renderTimer.current) clearTimeout(renderTimer.current) }
  }, [message.content, message.isLoading])

  // Memoize chart extraction so it doesn't run on every render
  const { cleanText: rawCleanText, charts } = useMemo(() => extractCharts(renderedContent), [renderedContent])

  // Normalize markdown: convert • bullets to proper lists, ensure spacing, fix unfenced code
  const cleanText = useMemo(() => {
    let t = rawCleanText

    // Detect and wrap unfenced code blocks: if response has code-like lines NOT inside ``` fences
    if (!t.includes('```')) {
      const lines = t.split('\n')
      const codePatterns = /^(import |from |class |def |function |const |let |var |export |return |if |elif |else:|for |while |try:|except |async |await |print\(|console\.|module\.|require\(|#include|package |public |private |protected |\s{2,}(self\.|this\.))/
      const codeLineCount = lines.filter(l => codePatterns.test(l)).length
      // If >40% of lines look like code, wrap the entire response in a code block
      if (codeLineCount > 3 && codeLineCount / lines.length > 0.4) {
        // Try to guess language
        const lang = lines.some(l => /^(import |from |def |class \w+:|print\()/.test(l)) ? 'python'
          : lines.some(l => /^(const |let |var |function |=>|console\.)/.test(l)) ? 'javascript'
          : lines.some(l => /^(package |public class|System\.out)/.test(l)) ? 'java'
          : ''
        t = '```' + lang + '\n' + t + '\n```'
      }
    }

    // Convert "• text" bullet lines into markdown "- text" list items
    t = t.replace(/^[•●▪▸►]/gm, '-')
    t = t.replace(/\n[•●▪▸►] /g, '\n- ')
    // Ensure headings have a blank line before them (markdown requires it)
    t = t.replace(/([^\n])\n(#{1,3} )/g, '$1\n\n$2')
    // Ensure horizontal rules have blank lines around them
    t = t.replace(/([^\n])\n(---)/g, '$1\n\n$2')
    t = t.replace(/(---)\n([^\n])/g, '$1\n\n$2')
    // Ensure list items after a paragraph have a blank line before
    t = t.replace(/([^\n-])\n(- )/g, '$1\n\n$2')
    // Ensure code fences have blank lines around them (markdown requires it)
    t = t.replace(/([^\n])\n(```)/g, '$1\n\n$2')
    t = t.replace(/(```)\n([^\n])/g, '$1\n\n$2')
    return t
  }, [rawCleanText])

  // Detect if response is document-worthy (for download bar)
  const contentRef = useRef<HTMLDivElement>(null)
  const documentInfo = useMemo(() => {
    if (isUser || message.isLoading) return null
    return isDocumentWorthy(message.content)
  }, [message.content, isUser, message.isLoading])

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
        display: 'flex', justifyContent: 'flex-end', marginBottom: '20px', paddingLeft: '60px',
        animation: 'fadeSlideIn 200ms ease-out',
      }}
      onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>
        <div className="user-msg-container" style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {isEditing ? (
            /* ── Edit mode — clean standalone card, no blue bubble ── */
            <div style={{
              width: '100%', minWidth: '320px',
              background: 'var(--chat-surface)', borderRadius: '16px',
              border: '1px solid var(--chat-border)',
              padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px',
            }}>
              <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus
                style={{
                  width: '100%', borderRadius: '10px', padding: '10px 14px',
                  fontSize: '15px', lineHeight: '1.6', resize: 'vertical', minHeight: '80px',
                  background: 'var(--chat-bg)', border: '1px solid var(--chat-border)',
                  color: 'var(--chat-text)', outline: 'none',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--chat-border)'}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setIsEditing(false); setEditValue(message.content) }}
                  style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', color: 'var(--chat-text-secondary)', border: '1px solid var(--chat-border)', cursor: 'pointer', fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={handleSaveEdit}
                  style={{ padding: '6px 16px', fontSize: '13px', color: 'white', borderRadius: '8px', background: 'var(--color-primary)', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                  Save & Resend
                </button>
              </div>
            </div>
          ) : (
            /* ── Normal display — image separate, text in bubble ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
              {/* Image — standalone, no background, no border, just rounded corners */}
              {message.imagePreview && (
                <img src={message.imagePreview} alt="Uploaded" style={{
                  maxWidth: '280px', maxHeight: '240px', display: 'block',
                  objectFit: 'cover', borderRadius: '16px',
                }} />
              )}

              {/* Text bubble — separate below image */}
              <div style={{
                background: 'var(--chat-user-bubble)', borderRadius: '20px 20px 4px 20px',
                padding: '12px 16px', fontSize: '15px', lineHeight: '1.65', color: 'var(--chat-text)',
                wordBreak: 'break-word', maxWidth: '100%',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
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
                {message.content.length > 500 ? (
                  // Long messages: show as collapsible doc-style block
                  <div>
                    <div style={{
                      maxHeight: showFullUserMsg ? 'none' : '120px', overflow: 'hidden',
                      position: 'relative', whiteSpace: 'pre-wrap',
                    }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={{
                          code(codeProps: ComponentPropsWithoutRef<'code'> & { inline?: boolean; className?: string }) {
                            const { inline, className, children: codeChildren, ...codeRest } = codeProps
                            const langMatch = /language-(\w+)/.exec(className || '')
                            const codeString = String(codeChildren).replace(/\n$/, '')
                            if (!inline && (langMatch || codeString.includes('\n'))) {
                              return <CodeBlock language={langMatch ? langMatch[1] : 'text'}>{codeString}</CodeBlock>
                            }
                            return <code style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px', fontSize: '13px' }} {...codeRest}>{codeChildren}</code>
                          },
                          pre: ({ children }) => <>{children}</>,
                          p: ({ children }) => <p style={{ marginBottom: '8px', lineHeight: '1.6' }} className="last:mb-0">{children}</p>,
                        }}>
                        {message.content}
                      </ReactMarkdown>
                      {!showFullUserMsg && (
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0, height: '50px',
                          background: 'linear-gradient(transparent, var(--chat-user-bubble))',
                        }} />
                      )}
                    </div>
                    <button onClick={() => setShowFullUserMsg(!showFullUserMsg)}
                      style={{
                        background: 'none', border: 'none', color: 'var(--color-primary)',
                        fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: '4px 0', marginTop: '4px',
                      }}>
                      {showFullUserMsg ? 'Show less' : `Show more (${message.content.length} chars)`}
                    </button>
                  </div>
                ) : (
                  // Short messages: render with basic markdown
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={{
                      code(codeProps: ComponentPropsWithoutRef<'code'> & { inline?: boolean; className?: string }) {
                        const { inline, className, children: codeChildren, ...codeRest } = codeProps
                        const langMatch = /language-(\w+)/.exec(className || '')
                        const codeString = String(codeChildren).replace(/\n$/, '')
                        if (!inline && (langMatch || codeString.includes('\n'))) {
                          return <CodeBlock language={langMatch ? langMatch[1] : 'text'}>{codeString}</CodeBlock>
                        }
                        return <code style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px', fontSize: '13px' }} {...codeRest}>{codeChildren}</code>
                      },
                      pre: ({ children }) => <>{children}</>,
                      p: ({ children }) => <p style={{ marginBottom: '4px', lineHeight: '1.6' }} className="last:mb-0">{children}</p>,
                    }}>
                    {message.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          )}

          {/* Action buttons — below bubble, never clipped */}
          {showActions && !isEditing && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '2px', marginTop: '4px',
              opacity: showActions ? 1 : 0, transition: 'opacity 150ms',
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
        </div>
      </div>
    )
  }

  /* ── AI MESSAGE — no bubble, text flows on dark bg ── */
  return (
    <div className="ai-message-row" style={{
      display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '28px',
      paddingRight: '40px', animation: 'fadeSlideIn 200ms ease-out',
    }}
    onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>

      {/* AI Avatar */}
      <div className="ai-avatar" style={{
        width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
        background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(79,70,229,0.15))',
        border: '1px solid rgba(124,58,237,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', color: '#A78BFA', marginTop: '2px',
      }}>✦</div>

      {/* Text area — no background, no border */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>

        {/* Web Search Card — ChatGPT-style horizontal carousel */}
        {message.webSearch && (() => {
          const gradients = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          ]
          return (
            <div style={{ marginBottom: '16px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7C3AED, #10B981)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', color: 'white', flexShrink: 0,
                }}>✦</div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--chat-text)' }}>
                  Searched the web
                </span>
                <span style={{ fontSize: '12px', color: 'var(--chat-text-muted)', fontStyle: 'italic' }}>
                  "{message.webSearch.query}"
                </span>
              </div>

              {/* Horizontal scrollable card carousel */}
              <div style={{
                display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px',
                scrollbarWidth: 'thin',
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
              }}>
                {message.webSearch.sources.map((source, idx) => {
                  let domain = ''
                  try { domain = new URL(source.url).hostname.replace('www.', '') } catch { domain = source.url }
                  const displayName = source.siteName || domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1)
                  // Detect if image is a real article thumbnail vs a logo fallback
                  const isLogoFallback = source.image?.includes('logo.clearbit.com')
                  const hasRealImage = source.image && !isLogoFallback
                  return (
                    <a
                      key={idx}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', flexDirection: 'column',
                        minWidth: '220px', maxWidth: '260px', flex: '0 0 auto',
                        borderRadius: '12px', overflow: 'hidden',
                        background: 'var(--chat-surface)',
                        border: '1px solid var(--chat-border)',
                        textDecoration: 'none', transition: 'all 0.2s ease',
                        scrollSnapAlign: 'start',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-primary)'
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--chat-border)'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      {/* Thumbnail area */}
                      <div style={{
                        height: '130px', width: '100%', position: 'relative',
                        background: gradients[idx % gradients.length],
                        overflow: 'hidden',
                      }}>
                        {/* Real article image — full cover */}
                        {hasRealImage && (
                          <img
                            src={source.image}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        )}
                        {/* Logo fallback — centered on gradient */}
                        {isLogoFallback && (
                          <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <img
                              src={source.image}
                              alt=""
                              style={{
                                width: '56px', height: '56px', borderRadius: '12px',
                                background: 'rgba(255,255,255,0.95)', padding: '8px',
                                objectFit: 'contain', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                              }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          </div>
                        )}
                        {/* Dark gradient overlay at bottom */}
                        <div style={{
                          position: 'absolute', inset: 0,
                          background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
                        }} />
                        {/* Source badge */}
                        <div style={{
                          position: 'absolute', bottom: '8px', left: '8px',
                          display: 'flex', alignItems: 'center', gap: '6px',
                          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                          padding: '4px 10px', borderRadius: '8px',
                        }}>
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                            width={16} height={16} alt=""
                            style={{ borderRadius: '3px', flexShrink: 0 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                          <span style={{ fontSize: '11px', color: '#fff', fontWeight: 600, letterSpacing: '0.02em' }}>
                            {displayName}
                          </span>
                        </div>
                      </div>

                      {/* Card text content */}
                      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{
                          fontSize: '13px', fontWeight: 600, color: 'var(--chat-text)',
                          lineHeight: '1.35',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                          overflow: 'hidden',
                        }}>
                          {source.title}
                        </div>
                        {source.snippet && (
                          <div style={{
                            fontSize: '11.5px', color: 'var(--chat-text-muted)', lineHeight: '1.45',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                          }}>
                            {source.snippet}
                          </div>
                        )}
                      </div>
                    </a>
                  )
                })}
              </div>

              {/* Expand/collapse arrow hint */}
              {message.webSearch.sources.length > 3 && (
                <div style={{
                  display: 'flex', justifyContent: 'center', marginTop: '4px',
                  color: 'var(--chat-text-dim)', fontSize: '18px', cursor: 'default',
                }}>
                  ›
                </div>
              )}
            </div>
          )
        })()}

        <div ref={contentRef} className="prose prose-sm max-w-none message-content" style={{ fontSize: '15px', lineHeight: '1.75', color: 'var(--chat-text)' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
              p: ({ children }) => {
                // Check if this paragraph is a chart placeholder
                const text = typeof children === 'string' ? children :
                  Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') :
                  String(children || '')
                const chartMatch = text.match(/\[CONVOIA_CHART_(\d+)\]/)
                if (chartMatch) {
                  const idx = parseInt(chartMatch[1])
                  if (charts[idx]) return <InlineChart chart={charts[idx]} />
                }
                return <p style={{ marginBottom: '16px', lineHeight: '1.75', color: 'var(--chat-text)' }} className="last:mb-0">{children}</p>
              },
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
              pre: ({ children }) => <>{children}</>,
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
              code(props: ComponentPropsWithoutRef<'code'> & { inline?: boolean; className?: string; node?: any }) {
                const { inline, className, children, node, ...rest } = props
                const match = /language-(\w+)/.exec(className || '')
                const codeStr = String(children).replace(/\n$/, '')
                // Detect block code: has language class, or parent is <pre>, or contains newlines (multi-line)
                const isBlock = !inline && (match || node?.position?.start?.line !== node?.position?.end?.line || codeStr.includes('\n'))
                if (isBlock) {
                  const lang = match ? match[1] : 'text'
                  return <CodeBlock language={lang}
                    onRun={onRunCode ? () => onRunCode(codeStr, lang) : undefined}
                    onOpenInCanvas={onOpenInCanvas ? (code, l) => onOpenInCanvas(code, l, 'code') : undefined}>
                    {codeStr}
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
            {cleanText || renderedContent}
          </ReactMarkdown>

          {/* Fallback: render any charts not matched by placeholders */}
          {charts.length > 0 && !(cleanText || renderedContent).includes('[CONVOIA_CHART_') &&
            charts.map((chart, i) => <InlineChart key={i} chart={chart} />)
          }
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

        {/* Document Download Bar — at the end after all content */}
        {documentInfo?.worthy && !message.isLoading && (
          <DocumentDownloadBar content={message.content} contentRef={contentRef} title={documentInfo.title} />
        )}

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
})
