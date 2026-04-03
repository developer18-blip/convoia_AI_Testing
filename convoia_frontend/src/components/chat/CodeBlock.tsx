import { useState } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import { Copy, Check, Play, PanelRight } from 'lucide-react'

SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('ts', typescript)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('py', python)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('shell', bash)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('md', markdown)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('tsx', tsx)

interface CodeBlockProps {
  language?: string
  children: string
  onRun?: () => void
  onOpenInCanvas?: (code: string, language: string) => void
}

export function CodeBlock({ language = 'text', children, onRun, onOpenInCanvas }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const displayLang = language === 'py' ? 'python'
    : language === 'js' ? 'javascript'
    : language === 'ts' ? 'typescript'
    : language === 'sh' || language === 'shell' ? 'bash'
    : language === 'md' ? 'markdown'
    : language

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '4px 10px', borderRadius: '6px',
    backgroundColor: 'transparent', border: '1px solid var(--chat-code-btn-border)',
    color: 'var(--chat-code-btn-text)', fontSize: '11.5px', cursor: 'pointer',
    fontFamily: 'Inter, system-ui, sans-serif', transition: 'all 150ms',
  }

  return (
    <div style={{
      margin: '16px 0', borderRadius: '12px', overflow: 'hidden',
      border: '1px solid var(--chat-code-border)', backgroundColor: 'var(--chat-code-bg)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', backgroundColor: 'var(--chat-code-header)',
        borderBottom: '1px solid var(--chat-code-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ color: 'var(--chat-code-icon)', fontSize: '12px', fontFamily: 'monospace' }}>&lt;/&gt;</span>
          <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--chat-code-lang)', textTransform: 'capitalize' }}>
            {displayLang}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onRun && (
            <button onClick={onRun} style={btnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--chat-code-btn-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--chat-code-btn-border)'; e.currentTarget.style.color = 'var(--chat-code-btn-text)' }}
            >
              <Play size={11} /> Run
            </button>
          )}

          {onOpenInCanvas && (
            <button onClick={() => onOpenInCanvas(children, displayLang)} style={btnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--chat-code-btn-border)'; e.currentTarget.style.color = 'var(--chat-code-btn-text)' }}
            >
              <PanelRight size={11} /> Canvas
            </button>
          )}

          <button onClick={handleCopy}
            style={{ ...btnStyle, color: copied ? 'var(--color-success)' : 'var(--chat-code-btn-text)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; if (!copied) e.currentTarget.style.color = 'var(--chat-code-btn-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--chat-code-btn-border)'; if (!copied) e.currentTarget.style.color = 'var(--chat-code-btn-text)' }}
          >
            {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
          </button>
        </div>
      </div>

      {/* Code */}
      <SyntaxHighlighter
        language={displayLang}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '16px 18px',
          backgroundColor: 'var(--chat-code-bg)',
          fontSize: '13.5px',
          lineHeight: '1.7',
          fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
          overflowX: 'auto',
        }}
        showLineNumbers={false}
        wrapLines={true}
        lineProps={() => ({ style: { background: 'transparent', display: 'block' } })}
        wrapLongLines={false}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}
