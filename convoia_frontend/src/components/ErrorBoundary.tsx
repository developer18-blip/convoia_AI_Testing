import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  componentStack: string | null
  copied: boolean
  showDetails: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null, copied: false, showDetails: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
    this.setState({ componentStack: info.componentStack || null })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, componentStack: null, copied: false, showDetails: false })
  }

  handleCopy = async () => {
    const payload = `Error: ${this.state.error?.message || 'unknown'}\n\nStack:\n${this.state.error?.stack || '(none)'}\n\nComponent Stack:\n${this.state.componentStack || '(none)'}`
    try {
      await navigator.clipboard.writeText(payload)
      this.setState({ copied: true })
      window.setTimeout(() => this.setState({ copied: false }), 2000)
    } catch {
      /* clipboard may be denied — ignore */
    }
  }

  render() {
    if (this.state.hasError) {
      const { error, componentStack, copied, showDetails } = this.state
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl p-8 max-w-2xl w-full text-center">
            <AlertTriangle size={48} className="text-danger mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">Something went wrong</h2>
            <p className="text-sm text-text-muted mb-6">
              {error?.message || 'An unexpected error occurred'}
            </p>

            <div className="flex items-center justify-center gap-2 mb-4">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg transition-colors"
              >
                <RefreshCw size={16} />
                Try Again
              </button>
              <button
                onClick={() => this.setState({ showDetails: !showDetails })}
                className="inline-flex items-center gap-2 bg-surface border border-border text-text-primary px-4 py-2 rounded-lg transition-colors hover:bg-background"
              >
                {showDetails ? 'Hide details' : 'Show technical details'}
              </button>
            </div>

            {showDetails && (
              <div className="text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-text-muted">Diagnostic info</span>
                  <button
                    onClick={this.handleCopy}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre
                  className="bg-background border border-border rounded-lg p-3 text-xs text-text-muted overflow-auto max-h-64 whitespace-pre-wrap font-mono"
                  style={{ wordBreak: 'break-word' }}
                >
                  {`Error: ${error?.message || 'unknown'}`}
                  {error?.stack ? `\n\nStack:\n${error.stack}` : ''}
                  {componentStack ? `\n\nComponent Stack:${componentStack}` : ''}
                </pre>
              </div>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
