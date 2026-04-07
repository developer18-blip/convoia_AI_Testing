import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: '32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 20px', maxWidth: '280px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '10px 24px', borderRadius: '12px', border: 'none',
              background: '#7C3AED', color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}>
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
