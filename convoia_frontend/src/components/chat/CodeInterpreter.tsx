import { useEffect, useRef, useState } from 'react'
import axios, { type AxiosError } from 'axios'
import { Play, X, Download, Share2, Wand2, Wrench, Zap, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'
import apiClient from '../../lib/api'

const AUTO_GREEN = '#10B981'

// Must match backend SANDBOX_SPEC (sandboxService.ts):
// 2 vCPU + 1 GiB RAM × 1.5 markup × 30s = $0.001463 ≈ 586 tokens at $0.0000025/token base rate.
// If you change the sandbox spec server-side, update this number.
const WORST_CASE_TOKENS = 586
const SANDBOX_TIMEOUT_MS = 30_000
const AXIOS_TIMEOUT_MS = 40_000  // 10s buffer above sandbox hard cap
const MAX_CODE_CHARS = 10_000

const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:5000/api'

interface CodeInterpreterProps {
  code: string
  language: string
  onClose: () => void
  onExplain?: (code: string) => void
  onFix?: (code: string, error: string) => void
  onOptimize?: (code: string) => void
}

const languages = ['python', 'javascript', 'typescript', 'sql', 'bash', 'json', 'yaml', 'markdown']

type SandboxErrorKind = 'timeout' | 'syntax_error' | 'runtime_error' | 'provision' | 'unknown'

interface SandboxPlot {
  id: string
  token: string
  mimeType: 'image/png'
  filename: string
}

interface RunResult {
  success: boolean
  stdout: string
  stderr: string
  executionTimeSec: number
  tokensCharged: number
  balanceAfter: number
  plots: SandboxPlot[]
  error?: { kind: SandboxErrorKind; message: string; traceback?: string }
}

type PanelError =
  | { type: 'http_400'; message: string }
  | { type: 'http_402'; message: string; currentBalance?: number; estimatedRequired?: number; canBuyTokens?: boolean }
  | { type: 'http_429_busy'; message: string }
  | { type: 'http_429_rate'; message: string }
  | { type: 'http_503'; message: string }
  | { type: 'http_unknown'; message: string }
  | { type: 'network'; message: string }

function classifyError(err: unknown): PanelError {
  if (axios.isCancel(err)) {
    return { type: 'network', message: 'Cancelled.' }
  }
  const e = err as AxiosError<any>
  if (!e?.response) {
    return { type: 'network', message: e?.message || 'Network error' }
  }
  const { status, data } = e.response
  switch (status) {
    case 400:
      return { type: 'http_400', message: data?.message || 'Invalid request' }
    case 402:
      return {
        type: 'http_402',
        message: data?.message || 'Insufficient tokens',
        currentBalance: data?.currentBalance,
        estimatedRequired: data?.estimatedRequired,
        canBuyTokens: data?.canBuyTokens,
      }
    case 429:
      return data?.code === 'SANDBOX_BUSY'
        ? { type: 'http_429_busy', message: data?.message || 'Previous run still in progress' }
        : { type: 'http_429_rate', message: 'Too many runs in the last minute. Try again shortly.' }
    case 503:
      return { type: 'http_503', message: data?.message || 'Sandbox temporarily unavailable' }
    default:
      return { type: 'http_unknown', message: data?.message || `Error ${status}` }
  }
}

export function CodeInterpreter({ code: initialCode, language: initialLang, onClose, onExplain, onFix, onOptimize }: CodeInterpreterProps) {
  const [code, setCode] = useState(initialCode)
  const [language, setLanguage] = useState(initialLang)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [panelError, setPanelError] = useState<PanelError | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const tickRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      // Server keeps running and will still bill if a request was in flight;
      // aborting only stops the spinner on the client.
      abortRef.current?.abort()
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current)
      }
    }
  }, [])

  const handleRun = async () => {
    if (language !== 'python') return  // Run button is hidden, but guard anyway
    if (code.length === 0) {
      setPanelError({ type: 'http_400', message: 'Code is empty.' })
      return
    }
    if (code.length > MAX_CODE_CHARS) {
      setPanelError({ type: 'http_400', message: `Code exceeds ${MAX_CODE_CHARS.toLocaleString()}-character limit.` })
      return
    }

    setResult(null)
    setPanelError(null)
    setElapsedMs(0)
    setIsRunning(true)

    const startedAt = Date.now()
    tickRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 100)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const resp = await apiClient.post<{ success: boolean; data: RunResult }>(
        '/sandbox/execute-python',
        { code },
        { timeout: AXIOS_TIMEOUT_MS, signal: ctrl.signal },
      )
      setResult(resp.data.data)
      if (resp.data.data.tokensCharged > 0) {
        // Mirror MessageInput.tsx pattern: fire-and-forget refresh so the
        // header wallet pill catches up with the new balance.
        window.dispatchEvent(new Event('wallet:refresh'))
      }
    } catch (err) {
      setPanelError(classifyError(err))
    } finally {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current)
        tickRef.current = null
      }
      abortRef.current = null
      setIsRunning(false)
    }
  }

  const handleClearError = () => {
    // Per design decision: Retry button clears the error and re-enables Run;
    // user clicks Run themselves to actually re-execute. Prevents accidental
    // double-billing on misclicks.
    setPanelError(null)
  }

  const handleBuyTokens = () => {
    window.dispatchEvent(new CustomEvent('wallet:insufficient', { detail: panelError }))
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

  const progressPct = Math.min(100, (elapsedMs / SANDBOX_TIMEOUT_MS) * 100)
  const sandboxErrColor =
    result?.error?.kind === 'timeout' ? '#F59E0B' :
    result?.error?.kind === 'provision' ? '#6B7280' :
    '#EF4444'

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
          {language === 'python' && (
            <Button
              size="sm"
              onClick={handleRun}
              isLoading={isRunning}
              disabled={panelError !== null}
              title={`Costs up to ~${WORST_CASE_TOKENS} tokens (30s max). Actual charge based on real execution time.`}
            >
              <Play size={12} /> Run
            </Button>
          )}
          <button onClick={handleDownload} className="p-1.5 text-text-muted hover:text-text-primary transition-colors">
            <Download size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Progress bar (only while running) */}
      {isRunning && (
        <div className="relative h-1 bg-border">
          <div
            className="absolute inset-y-0 left-0 transition-all duration-100"
            style={{ width: `${progressPct}%`, backgroundColor: AUTO_GREEN }}
          />
          <span className="absolute right-2 top-2 text-xs text-text-muted font-mono pointer-events-none">
            {(elapsedMs / 1000).toFixed(1)}s / 30s
          </span>
        </div>
      )}

      {/* Code editor */}
      <div className="border-b border-border">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full bg-border p-4 text-sm font-mono text-text-secondary focus:outline-none resize-none min-h-[120px]"
          spellCheck={false}
        />
      </div>

      {/* Panel-level error block (HTTP / network / client) */}
      {panelError && (
        <div className="border-b border-border px-4 py-3 flex items-start gap-3" style={{ backgroundColor: '#EF444410' }}>
          <AlertCircle size={16} style={{ color: '#EF4444', flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1 text-sm text-text-primary">
            <div>{panelError.message}</div>
            {panelError.type === 'http_402' && typeof panelError.currentBalance === 'number' && typeof panelError.estimatedRequired === 'number' && (
              <div className="text-xs text-text-muted mt-1">
                Balance: {panelError.currentBalance.toLocaleString()} · Needed: ~{panelError.estimatedRequired.toLocaleString()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {panelError.type === 'http_402' && panelError.canBuyTokens && (
              <Button size="sm" variant="ghost" onClick={handleBuyTokens}>
                Buy tokens
              </Button>
            )}
            {(panelError.type === 'http_429_rate' || panelError.type === 'http_503' || panelError.type === 'http_unknown' || panelError.type === 'network') && (
              <Button size="sm" variant="ghost" onClick={handleClearError}>
                <RefreshCw size={12} /> Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Plots grid (rendered even when sandbox error.kind is set — plots may exist before raise) */}
      {result && result.plots.length > 0 && (
        <div className="border-b border-border px-4 py-3">
          <div className="text-xs font-medium text-text-muted uppercase mb-2">
            Plots ({result.plots.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {result.plots.map((plot) => {
              const url = `${apiBase}/sandbox/plot/${plot.id}?token=${plot.token}`
              return (
                <a key={plot.id} href={url} target="_blank" rel="noopener noreferrer" title={`${plot.filename} — click to open full size`}>
                  <img src={url} alt={plot.filename} className="w-full rounded border border-border hover:opacity-90 transition-opacity" />
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Output (stdout / stderr / sandbox error) */}
      {result && (result.stdout || result.stderr || result.error) && (
        <div className="border-b border-border">
          <div className="px-4 py-2 bg-surface-2 flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted uppercase">Output</span>
            <span className="text-xs text-text-muted font-mono">Execution time: {result.executionTimeSec.toFixed(2)}s</span>
          </div>
          <div className="p-4 space-y-2">
            {result.stdout && (
              <pre className="text-sm font-mono text-text-secondary whitespace-pre-wrap">{result.stdout}</pre>
            )}
            {result.stderr && (
              <pre className="text-sm font-mono whitespace-pre-wrap" style={{ color: '#F59E0B' }}>{result.stderr}</pre>
            )}
            {result.error && (
              <div className="text-sm font-mono whitespace-pre-wrap" style={{ color: sandboxErrColor }}>
                <div className="font-medium">{result.error.kind}: {result.error.message}</div>
                {result.error.traceback && (
                  <pre className="mt-1 text-xs whitespace-pre-wrap opacity-80">{result.error.traceback}</pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Post-run cost footer */}
      {result && result.tokensCharged > 0 && (
        <div className="px-4 py-2 text-xs text-text-muted font-mono border-b border-border flex justify-between">
          <span>Charged: {result.tokensCharged.toLocaleString()} tokens</span>
          <span>Balance: {result.balanceAfter.toLocaleString()}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 py-3 flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => onExplain?.(code)}>
          <Wand2 size={12} /> Explain
        </Button>
        {result?.error && (
          <Button size="sm" variant="ghost" onClick={() => onFix?.(code, result.error!.message)}>
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
