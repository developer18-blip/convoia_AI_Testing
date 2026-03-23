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

  return (
    <div
      style={{ margin: '16px 0', borderRadius: '10px', overflow: 'hidden', border: '1px solid #2a2a2a', backgroundColor: '#1a1a1a' }}
    >
      {/* Header bar — always visible */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', backgroundColor: '#222222', borderBottom: '1px solid #2a2a2a',
      }}>
        {/* Language label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ color: '#666', fontSize: '12px', fontFamily: 'monospace' }}>&lt;/&gt;</span>
          <span style={{ fontSize: '12.5px', fontWeight: 500, color: '#aaa', textTransform: 'capitalize', fontFamily: 'Inter, sans-serif' }}>
            {displayLang}
          </span>
        </div>

        {/* Action buttons — always visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Run button — only if onRun provided */}
          {onRun && (
            <button onClick={onRun}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '3px 10px', borderRadius: '5px',
                backgroundColor: 'transparent', border: '1px solid #333',
                color: '#888', fontSize: '11.5px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                transition: 'all 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#ccc' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#888' }}
            >
              <Play size={11} /> Run
            </button>
          )}

          {/* Open in Canvas */}
          {onOpenInCanvas && (
            <button onClick={() => onOpenInCanvas(children, displayLang)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '3px 10px', borderRadius: '5px',
                backgroundColor: 'transparent', border: '1px solid #333',
                color: '#888', fontSize: '11.5px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                transition: 'all 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#A78BFA' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#888' }}
            >
              <PanelRight size={11} /> Canvas
            </button>
          )}

          {/* Copy button */}
          <button onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '3px 10px', borderRadius: '5px',
              backgroundColor: 'transparent', border: '1px solid #333',
              color: copied ? '#4ade80' : '#888',
              fontSize: '11.5px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = copied ? '#4ade80' : '#ccc' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = copied ? '#4ade80' : '#888' }}
          >
            {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
          </button>
        </div>
      </div>

      {/* Code body */}
      <SyntaxHighlighter
        language={displayLang}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '16px 18px',
          backgroundColor: '#1a1a1a',
          fontSize: '13px',
          lineHeight: '1.65',
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
