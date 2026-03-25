import { useState } from 'react'
import { Play, X, Download, Share2, Wand2, Wrench, Zap } from 'lucide-react'
import { Button } from '../ui/Button'

interface CodeInterpreterProps {
  code: string
  language: string
  onClose: () => void
  onExplain?: (code: string) => void
  onFix?: (code: string, error: string) => void
  onOptimize?: (code: string) => void
}

const languages = ['python', 'javascript', 'typescript', 'sql', 'bash', 'json', 'yaml', 'markdown']

export function CodeInterpreter({ code: initialCode, language: initialLang, onClose, onExplain, onFix, onOptimize }: CodeInterpreterProps) {
  const [code, setCode] = useState(initialCode)
  const [language, setLanguage] = useState(initialLang)
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [executionTime, setExecutionTime] = useState<number | null>(null)

  const handleRun = async () => {
    setIsRunning(true)
    setOutput(null)
    setError(null)

    // Simulated execution — actual sandbox coming soon
    await new Promise((r) => setTimeout(r, 800))
    const start = Date.now()

    if (language === 'python' || language === 'javascript' || language === 'typescript') {
      setOutput('Code execution sandbox coming soon.\n\nThe output will appear here once the feature is live.')
    } else {
      setOutput(`[Preview] Formatted ${language} output will appear here.`)
    }

    setExecutionTime((Date.now() - start) / 1000)
    setIsRunning(false)
  }

  const handleDownload = () => {
    const ext = { python: 'py', javascript: 'js', typescript: 'ts', sql: 'sql', bash: 'sh', json: 'json', yaml: 'yml', markdown: 'md' }[language] || 'txt'
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `code.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleShare = () => {
    navigator.clipboard.writeText(code)
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-primary">Code Interpreter</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-surface border border-border rounded px-2 py-1 text-xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {languages.map((l) => (
              <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleRun} isLoading={isRunning}>
            <Play size={12} /> Run
          </Button>
          <button onClick={handleDownload} className="p-1.5 text-text-muted hover:text-text-primary transition-colors">
            <Download size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Code editor */}
      <div className="border-b border-border">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full bg-border p-4 text-sm font-mono text-text-secondary focus:outline-none resize-none min-h-[120px]"
          spellCheck={false}
        />
      </div>

      {/* Output */}
      {(output || error) && (
        <div className="border-b border-border">
          <div className="px-4 py-2 bg-surface-2 flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted uppercase">Output</span>
            {executionTime !== null && (
              <span className="text-xs text-text-muted font-mono">Execution time: {executionTime.toFixed(3)}s</span>
            )}
          </div>
          <div className="p-4">
            {error ? (
              <pre className="text-sm font-mono text-danger whitespace-pre-wrap">{error}</pre>
            ) : (
              <pre className="text-sm font-mono text-text-secondary whitespace-pre-wrap">{output}</pre>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 py-3 flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => onExplain?.(code)}>
          <Wand2 size={12} /> Explain
        </Button>
        {error && (
          <Button size="sm" variant="ghost" onClick={() => onFix?.(code, error)}>
            <Wrench size={12} /> Fix
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onOptimize?.(code)}>
          <Zap size={12} /> Optimize
        </Button>
        <Button size="sm" variant="ghost" onClick={handleShare}>
          <Share2 size={12} /> Copy
        </Button>
      </div>
    </div>
  )
}
