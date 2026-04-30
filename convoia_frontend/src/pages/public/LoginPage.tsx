import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { Input } from '../../components/primitives/Input'
import { Button } from '../../components/primitives/Button'
import { SignalLine } from '../../components/primitives/SignalLine'
import { ComputationLine } from '../../components/primitives/ComputationLine'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api from '../../lib/api'

export function LoginPage() {
  const { login, googleLogin } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('inviteToken')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  // Forgot-password modal state — preserved from the legacy page
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!email) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email address'
    if (!password) e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    try {
      setIsLoading(true)
      await login(email, password, rememberMe)
      if (inviteToken) {
        try {
          const res = await api.post('/team/accept-invite', { token: inviteToken })
          toast.success(res.data.message || 'Joined organization successfully!')
        } catch (inviteErr: any) {
          toast.error(inviteErr.response?.data?.message || 'Failed to accept invite')
        }
      } else {
        toast.success('Welcome back!')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Login failed'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  // Cmd/Ctrl+Enter submits the form
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        document.querySelector<HTMLFormElement>('form.auth-login-form')?.requestSubmit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <AuthLayout
        title="Welcome back"
        subtitle="Sign in to continue to Convoia AI"
        footer={
          <span>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
              Create one
            </Link>
          </span>
        }
      >
        {/* Google OAuth — identical behaviour to the legacy page */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              if (!credentialResponse.credential) return
              try {
                await googleLogin(credentialResponse.credential)
                toast.success('Welcome!')
              } catch (err: any) {
                toast.error(err?.response?.data?.message || 'Google sign-in failed')
              }
            }}
            onError={() => toast.error('Google sign-in failed')}
            theme="outline"
            shape="rectangular"
            size="large"
            width="360"
            text="continue_with"
          />
        </div>

        <div style={{ position: 'relative', margin: '4px 0', textAlign: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%', borderTop: '0.5px solid var(--border-subtle)' }} />
          </div>
          <span className="mono-label" style={{ position: 'relative', background: 'var(--surface-1)', padding: '0 12px', fontSize: 10 }}>
            OR WITH EMAIL
          </span>
        </div>

        <form className="auth-login-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
            error={errors.email}
            required
            autoFocus
            autoComplete="email"
          />
          <div>
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
              error={errors.password}
              required
              autoComplete="current-password"
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <label htmlFor="remember-me" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-tertiary)' }} className="text-body-sm">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span>Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotSent(false) }}
                className="text-body-sm"
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}
              >
                Forgot password?
              </button>
            </div>
          </div>

          <SignalLine />

          <Button type="submit" variant="primary" size="lg" loading={isLoading} disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>

          {isLoading && <ComputationLine label="AUTHENTICATING" />}

          <div className="mono-label" style={{ textAlign: 'center', marginTop: 4, fontSize: 10 }}>
            <span className="mono" style={{ padding: '2px 6px', border: '0.5px solid currentColor', borderRadius: 3 }}>⌘</span>{' '}
            +{' '}
            <span className="mono" style={{ padding: '2px 6px', border: '0.5px solid currentColor', borderRadius: 3 }}>↵</span>{' '}
            TO SUBMIT
          </div>
        </form>
      </AuthLayout>

      {/* Forgot password modal — preserved logic, re-styled to match design system */}
      {showForgot && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          }}
          onClick={() => setShowForgot(false)}
        >
          <div
            className="grain-surface"
            style={{
              background: 'var(--surface-1)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-xl)',
              padding: 28, maxWidth: 400, width: '90%',
              boxShadow: 'var(--shadow-xl)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {forgotSent ? (
              <div style={{ textAlign: 'center' }}>
                <h3 className="text-h3" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>Check your email</h3>
                <p className="text-body-sm" style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
                  If an account exists for <strong>{forgotEmail}</strong>, we've sent a password reset link.
                </p>
                <Button variant="primary" size="md" onClick={() => setShowForgot(false)}>Got it</Button>
              </div>
            ) : (
              <>
                <h3 className="text-h3" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>Forgot your password?</h3>
                <p className="text-body-sm" style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
                  Enter your email and we'll send you a reset link.
                </p>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  if (!forgotEmail) return
                  setForgotLoading(true)
                  try {
                    await api.post('/auth/forgot-password', { email: forgotEmail })
                    setForgotSent(true)
                  } catch {
                    // Still show success to prevent email enumeration
                    setForgotSent(true)
                  } finally {
                    setForgotLoading(false)
                  }
                }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="Enter your email"
                    autoFocus
                    required
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button type="button" variant="ghost" size="md" onClick={() => setShowForgot(false)}>Cancel</Button>
                    <Button type="submit" variant="primary" size="md" loading={forgotLoading} disabled={forgotLoading}>
                      {forgotLoading ? 'Sending...' : 'Send reset link'}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default LoginPage
