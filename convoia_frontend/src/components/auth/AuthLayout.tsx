import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ConvoiaMark } from '../brand/ConvoiaMark'
import { PROVIDER_THEMES } from '../../config/providers'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle?: string
  footer?: ReactNode
  /** Use wider card for multi-step / business registration flow */
  wide?: boolean
}

export function AuthLayout({ children, title, subtitle, footer, wide = false }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <div className="auth-layout__ambient" />

      <Link to="/" className="auth-layout__back mono-label">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        BACK TO HOME
      </Link>

      <div className={`auth-layout__card grain-surface ${wide ? 'auth-layout__card--wide' : ''}`}>
        <div className="auth-layout__header">
          <ConvoiaMark size={40} state="idle" />
          <h1 className="text-h2" style={{ marginTop: 16, marginBottom: 6, color: 'var(--text-primary)' }}>{title}</h1>
          {subtitle && <p className="text-body-sm" style={{ color: 'var(--text-secondary)', margin: 0 }}>{subtitle}</p>}
        </div>

        <div className="auth-layout__body">
          {children}
        </div>

        {footer && <div className="auth-layout__footer">{footer}</div>}
      </div>

      <div className="auth-layout__providers">
        <div className="mono-label" style={{ marginBottom: 12, textAlign: 'center', fontSize: 10 }}>
          ROUTING ACROSS
        </div>
        <div className="auth-layout__provider-dots">
          {Object.entries(PROVIDER_THEMES).filter(([k]) => k !== 'default').slice(0, 8).map(([key, t]) => (
            <div key={key} className="auth-layout__provider-chip" title={t.name}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.primary }} />
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
