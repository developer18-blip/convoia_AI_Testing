import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { LoginCarousel } from '../../components/auth/LoginCarousel'
import { Input } from '../../components/primitives/Input'
import { Button } from '../../components/primitives/Button'
import { SignalLine } from '../../components/primitives/SignalLine'
import { ComputationLine } from '../../components/primitives/ComputationLine'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api from '../../lib/api'
import '../../styles/login-page.css'
import '../../styles/auth-split-layout.css'

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
        className="login-page"
        title="Welcome back"
        subtitle="Sign in to continue to Convoia AI"
        rightPane={<LoginCarousel />}
        footer={
          <span>
            Don't have an account?{' '}
            <Link to="/register" className="login-page__link">Create one</Link>
            {' '}— get <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>100K free tokens</strong> to start.
          </span>
        }
      >
        <div className="login-page__google">
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

        <div className="login-page__divider">
          <span className="mono-label login-page__divider-label">OR WITH EMAIL</span>
        </div>

        <form className="auth-login-form login-page__form" onSubmit={handleSubmit}>
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
            <div className="login-page__row">
              <label htmlFor="remember-me" className="login-page__remember text-body-sm">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="login-page__checkbox"
                />
                <span>Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotSent(false) }}
                className="login-page__link-btn text-body-sm"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <SignalLine />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isLoading}
            disabled={isLoading}
            className="login-page__submit"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>

          {isLoading && <ComputationLine label="AUTHENTICATING" />}

          <div className="login-page__shortcut mono-label">
            <kbd className="mono login-page__kbd">⌘</kbd>
            {' + '}
            <kbd className="mono login-page__kbd">↵</kbd>
            {' TO SUBMIT'}
          </div>
        </form>
      </AuthLayout>

      {showForgot && (
        <div
          className="login-page__modal-overlay"
          onClick={() => setShowForgot(false)}
        >
          <div
            className="login-page__modal grain-surface"
            onClick={(e) => e.stopPropagation()}
          >
            {forgotSent ? (
              <div className="login-page__modal-success">
                <h3 className="text-h3 login-page__modal-title">Check your email</h3>
                <p className="text-body-sm login-page__modal-body">
                  If an account exists for <strong>{forgotEmail}</strong>, we've sent a password reset link.
                </p>
                <Button variant="primary" size="md" onClick={() => setShowForgot(false)}>Got it</Button>
              </div>
            ) : (
              <>
                <h3 className="text-h3 login-page__modal-title">Forgot your password?</h3>
                <p className="text-body-sm login-page__modal-body">
                  Enter your email and we'll send you a reset link.
                </p>
                <form
                  className="login-page__modal-form"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!forgotEmail) return
                    setForgotLoading(true)
                    try {
                      await api.post('/auth/forgot-password', { email: forgotEmail })
                      setForgotSent(true)
                    } catch {
                      // Show success regardless to prevent email enumeration
                      setForgotSent(true)
                    } finally {
                      setForgotLoading(false)
                    }
                  }}
                >
                  <Input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="Enter your email"
                    autoFocus
                    required
                  />
                  <div className="login-page__modal-actions">
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
