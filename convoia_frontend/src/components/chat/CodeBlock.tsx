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
    backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.5)', fontSize: '11.5px', cursor: 'pointer',
    fontFamily: 'Inter, system-ui, sans-serif', transition: 'all 150ms',
  }

  return (
    <div style={{
      margin: '16px 0', borderRadius: '12px', overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#0D0D0D',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', backgroundColor: '#161616',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', fontFamily: 'monospace' }}>&lt;/&gt;</span>
          <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'rgba(255,255,255,0.55)', textTransform: 'capitalize' }}>
            {displayLang}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onRun && (
            <button onClick={onRun} style={btnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
            >
              <Play size={11} /> Run
            </button>
          )}

          {onOpenInCanvas && (
            <button onClick={() => onOpenInCanvas(children, displayLang)} style={btnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.color = '#A78BFA' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
            >
              <PanelRight size={11} /> Canvas
            </button>
          )}

          <button onClick={handleCopy}
            style={{ ...btnStyle, color: copied ? '#4ade80' : 'rgba(255,255,255,0.5)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; if (!copied) e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; if (!copied) e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
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
          backgroundColor: '#0D0D0D',
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
