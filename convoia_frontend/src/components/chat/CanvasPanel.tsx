import { useState, useRef, useEffect, useCallback } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  X, Copy, Check, Download, Maximize2, Minimize2,
  Code2, FileText, Play, Pencil, Eye, ChevronLeft,
  ChevronRight, Trash2, RotateCcw,
} from 'lucide-react'
import type { CanvasItem } from '../../types'

interface CanvasPanelProps {
  items: CanvasItem[]
  activeItemId: string | null
  onClose: () => void
  onUpdateItem: (id: string, content: string) => void
  onRemoveItem: (id: string) => void
  onSetActive: (id: string) => void
  onInsertToChat?: (content: string) => void
  onRunCode?: (code: string, language: string) => void
}

const LANG_LABELS: Record<string, string> = {
  javascript: 'JavaScript', js: 'JavaScript', typescript: 'TypeScript', ts: 'TypeScript',
  python: 'Python', py: 'Python', bash: 'Bash', shell: 'Bash', json: 'JSON',
  css: 'CSS', sql: 'SQL', html: 'HTML', markdown: 'Markdown', md: 'Markdown',
  jsx: 'JSX', tsx: 'TSX', java: 'Java', go: 'Go', rust: 'Rust', cpp: 'C++',
  c: 'C', ruby: 'Ruby', php: 'PHP', swift: 'Swift', kotlin: 'Kotlin', yaml: 'YAML',
}

export function CanvasPanel({
  items, activeItemId, onClose, onUpdateItem, onRemoveItem,
  onSetActive, onInsertToChat, onRunCode,
}: CanvasPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [width, setWidth] = useState(480)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const resizeRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const activeItem = items.find(i => i.id === activeItemId) || items[items.length - 1]
  const activeIdx = items.findIndex(i => i.id === activeItem?.id)

  // Sync edit content when switching items
  useEffect(() => {
    if (activeItem) {
      setEditContent(activeItem.content)
      setIsEditing(false)
    }
  }, [activeItem?.id])

  // Auto-focus editor
  useEffect(() => {
    if (isEditing && editorRef.current) {
      editorRef.current.focus()
      editorRef.current.setSelectionRange(
        editorRef.current.value.length,
        editorRef.current.value.length
      )
    }
  }, [isEditing])

  // Resize handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startX = e.clientX
    const startWidth = width

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const diff = startX - e.clientX
      const newWidth = Math.max(360, Math.min(900, startWidth + diff))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [width])

  const handleCopy = () => {
    navigator.clipboard.writeText(activeItem?.content || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!activeItem) return
    const ext = activeItem.type === 'code'
      ? (activeItem.language === 'python' || activeItem.language === 'py' ? '.py'
        : activeItem.language === 'typescript' || activeItem.language === 'ts' ? '.ts'
        : activeItem.language === 'javascript' || activeItem.language === 'js' ? '.js'
        : activeItem.language === 'json' ? '.json'
        : activeItem.language === 'css' ? '.css'
        : activeItem.language === 'html' ? '.html'
        : activeItem.language === 'sql' ? '.sql'
        : activeItem.language === 'bash' || activeItem.language === 'shell' ? '.sh'
        : activeItem.language === 'java' ? '.java'
        : activeItem.language === 'go' ? '.go'
        : activeItem.language === 'rust' ? '.rs'
        : '.txt')
      : '.md'
    const blob = new Blob([activeItem.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeItem.title.replace(/\s+/g, '_').toLowerCase()}${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveEdit = () => {
    if (activeItem && editContent !== activeItem.content) {
      onUpdateItem(activeItem.id, editContent)
    }
    setIsEditing(false)
  }

  const handleDiscardEdit = () => {
    if (activeItem) {
      setEditContent(activeItem.content)
    }
    setIsEditing(false)
  }

  const handlePrev = () => {
    if (activeIdx > 0) onSetActive(items[activeIdx - 1].id)
  }

  const handleNext = () => {
    if (activeIdx < items.length - 1) onSetActive(items[activeIdx + 1].id)
  }

  if (!activeItem) return null

  const langLabel = activeItem.language
    ? LANG_LABELS[activeItem.language] || activeItem.language
    : 'Text'

  const lineCount = activeItem.content.split('\n').length

  return (
    <div
      style={{
        width: isExpanded ? '100%' : `${width}px`,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--color-surface-2)',
        borderLeft: '1px solid var(--color-border)',
        position: 'relative',
        transition: isExpanded ? 'width 200ms ease' : undefined,
      }}
    >
      {/* Resize handle */}
      {!isExpanded && (
        <div
          ref={resizeRef}
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '4px',
            cursor: 'col-resize',
            zIndex: 20,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-primary)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
          }}
        />
      )}

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        {/* Icon */}
        <div style={{
          width: '26px', height: '26px', borderRadius: '6px',
          background: activeItem.type === 'code' ? 'rgba(124,58,237,0.15)' : 'rgba(59,130,246,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {activeItem.type === 'code'
            ? <Code2 size={14} style={{ color: '#A78BFA' }} />
            : <FileText size={14} style={{ color: '#60A5FA' }} />
          }
        </div>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {activeItem.title}
          </h3>
          <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>
            {langLabel} {activeItem.type === 'code' && `\u00b7 ${lineCount} lines`}
          </p>
        </div>

        {/* Navigation between items */}
        {items.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button onClick={handlePrev} disabled={activeIdx === 0}
              style={{
                padding: '4px', borderRadius: '4px', border: 'none',
                background: 'transparent', color: activeIdx === 0 ? '#333' : '#888',
                cursor: activeIdx === 0 ? 'default' : 'pointer',
              }}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace', minWidth: '32px', textAlign: 'center' }}>
              {activeIdx + 1}/{items.length}
            </span>
            <button onClick={handleNext} disabled={activeIdx === items.length - 1}
              style={{
                padding: '4px', borderRadius: '4px', border: 'none',
                background: 'transparent', color: activeIdx === items.length - 1 ? '#333' : '#888',
                cursor: activeIdx === items.length - 1 ? 'default' : 'pointer',
              }}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button onClick={() => setIsExpanded(!isExpanded)} title={isExpanded ? 'Collapse' : 'Expand'}
            style={{ padding: '5px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#888', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; e.currentTarget.style.color = '#ccc' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}>
            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={onClose} title="Close canvas"
            style={{ padding: '5px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#888', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-border)'; e.currentTarget.style.color = '#ccc' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 14px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {/* Edit / Preview toggle */}
        <button
          onClick={() => isEditing ? handleSaveEdit() : setIsEditing(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
            border: '1px solid #2a2a3a',
            background: isEditing ? 'rgba(124,58,237,0.15)' : 'transparent',
            color: isEditing ? '#A78BFA' : '#888', cursor: 'pointer',
          }}
          onMouseEnter={e => { if (!isEditing) e.currentTarget.style.color = '#ccc' }}
          onMouseLeave={e => { if (!isEditing) e.currentTarget.style.color = '#888' }}
        >
          {isEditing ? <><Check size={12} /> Save</> : <><Pencil size={12} /> Edit</>}
        </button>

        {isEditing && (
          <button onClick={handleDiscardEdit}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
              border: '1px solid #2a2a3a', background: 'transparent',
              color: '#888', cursor: 'pointer',
            }}>
            <RotateCcw size={12} /> Discard
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Run (code only) */}
        {activeItem.type === 'code' && onRunCode && (
          <button onClick={() => onRunCode(activeItem.content, activeItem.language || 'text')}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
              border: '1px solid #2a2a3a', background: 'transparent',
              color: '#4ade80', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,222,128,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Play size={12} /> Run
          </button>
        )}

        {/* Copy */}
        <button onClick={handleCopy}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
            border: '1px solid #2a2a3a', background: 'transparent',
            color: copied ? '#4ade80' : '#888', cursor: 'pointer',
          }}>
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>

        {/* Download */}
        <button onClick={handleDownload}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
            border: '1px solid #2a2a3a', background: 'transparent',
            color: '#888', cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#ccc'}
          onMouseLeave={e => e.currentTarget.style.color = '#888'}
        >
          <Download size={12} />
        </button>

        {/* Insert to chat */}
        {onInsertToChat && (
          <button onClick={() => onInsertToChat(activeItem.content)} title="Insert into chat"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
              border: '1px solid #2a2a3a', background: 'transparent',
              color: '#888', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#ccc'}
            onMouseLeave={e => e.currentTarget.style.color = '#888'}
          >
            <Eye size={12} /> Use
          </button>
        )}

        {/* Delete */}
        <button onClick={() => onRemoveItem(activeItem.id)} title="Remove from canvas"
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
            border: '1px solid #2a2a3a', background: 'transparent',
            color: '#666', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef444440' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = '#2a2a3a' }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {isEditing ? (
          /* ── Edit Mode ── */
          <textarea
            ref={editorRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              height: '100%',
              padding: '16px 18px',
              backgroundColor: 'var(--color-surface)',
              color: '#d4d4d8',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: '13px',
              lineHeight: '1.65',
              fontFamily: activeItem.type === 'code'
                ? "'Fira Code', 'Cascadia Code', Consolas, monospace"
                : "'Inter', sans-serif",
              tabSize: 2,
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => {
              // Tab inserts spaces in code mode
              if (e.key === 'Tab' && activeItem.type === 'code') {
                e.preventDefault()
                const start = e.currentTarget.selectionStart
                const end = e.currentTarget.selectionEnd
                const val = editContent
                setEditContent(val.substring(0, start) + '  ' + val.substring(end))
                setTimeout(() => {
                  if (editorRef.current) {
                    editorRef.current.selectionStart = editorRef.current.selectionEnd = start + 2
                  }
                }, 0)
              }
              // Ctrl+S to save
              if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                handleSaveEdit()
              }
            }}
          />
        ) : activeItem.type === 'code' ? (
          /* ── Code Preview ── */
          <SyntaxHighlighter
            language={activeItem.language || 'text'}
            style={oneDark}
            showLineNumbers
            lineNumberStyle={{ color: '#444', fontSize: '12px', minWidth: '36px', paddingRight: '12px' }}
            customStyle={{
              margin: 0,
              padding: '16px 18px',
              backgroundColor: 'var(--color-surface)',
              fontSize: '13px',
              lineHeight: '1.65',
              fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
              height: '100%',
              overflow: 'auto',
            }}
            wrapLines
            wrapLongLines={false}
          >
            {activeItem.content}
          </SyntaxHighlighter>
        ) : (
          /* ── Markdown Preview ── */
          <div style={{ padding: '20px 24px' }}>
            <div className="prose prose-sm max-w-none" style={{ color: '#d4d4d8', fontSize: '14px', lineHeight: '1.75' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p style={{ marginBottom: '14px', lineHeight: '1.75', color: '#d4d4d8' }}>{children}</p>,
                  h1: ({ children }) => <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px', marginTop: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '10px', marginTop: '20px' }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px', marginTop: '16px' }}>{children}</h3>,
                  ul: ({ children }) => <ul style={{ paddingLeft: '24px', marginBottom: '14px', listStyleType: 'disc' }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ paddingLeft: '24px', marginBottom: '14px', listStyleType: 'decimal' }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: '4px', lineHeight: '1.65', color: '#d4d4d8' }}>{children}</li>,
                  strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{children}</strong>,
                  code: ({ children }) => (
                    <code style={{
                      backgroundColor: 'var(--color-border)', color: '#A78BFA',
                      padding: '1px 6px', borderRadius: '4px', fontSize: '13px',
                      fontFamily: "'Fira Code', monospace",
                    }}>{children}</code>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote style={{
                      borderLeft: '3px solid #7C3AED', paddingLeft: '16px',
                      margin: '16px 0', color: '#888', fontStyle: 'italic',
                    }}>{children}</blockquote>
                  ),
                  table: ({ children }) => (
                    <div style={{ overflow: 'auto', margin: '14px 0', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th style={{ backgroundColor: 'var(--color-surface)', padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border)' }}>{children}</th>
                  ),
                  td: ({ children }) => (
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', color: '#aaa' }}>{children}</td>
                  ),
                }}
              >
                {activeItem.content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        borderTop: '1px solid var(--color-border)',
        flexShrink: 0,
        fontSize: '11px',
        color: '#555',
      }}>
        <span>
          {activeItem.type === 'code'
            ? `${lineCount} lines \u00b7 ${activeItem.content.length} chars`
            : `${activeItem.content.split(/\s+/).filter(Boolean).length} words \u00b7 ${activeItem.content.length} chars`
          }
        </span>
        {isEditing && (
          <span style={{ color: '#A78BFA' }}>
            Editing \u00b7 Ctrl+S to save
          </span>
        )}
      </div>
    </div>
  )
}
