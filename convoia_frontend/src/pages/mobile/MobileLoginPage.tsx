import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Sparkles, Brain, Zap, Shield } from 'lucide-react'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api from '../../lib/api'

export function MobileLoginPage() {
  const { login, googleLogin } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('inviteToken')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      await login(email, password)
      if (inviteToken) {
        try {
          const res = await api.post('/team/accept-invite', { token: inviteToken })
          toast.success(res.data.message || 'Joined organization!')
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

  return (
    <div className="mobile-app" style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      background: '#F8F7FF',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* Purple gradient hero */}
      <div style={{
        background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 50%, #4C1D95 100%)',
        padding: '40px 24px 60px',
        position: 'relative', overflow: 'hidden',
        borderRadius: '0 0 32px 32px',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-20px', left: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <img src="/logo.png?v=2" alt="ConvoiaAI" style={{ height: '36px', objectFit: 'contain', filter: 'brightness(10)' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>

        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'white', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
          Welcome back
        </h1>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
          Sign in to your AI gateway
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
          {[
            { icon: Brain, label: '35+ Models' },
            { icon: Zap, label: 'Lightning Fast' },
            { icon: Shield, label: 'Secure' },
          ].map(f => (
            <div key={f.label} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', borderRadius: '20px',
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
            }}>
              <f.icon size={12} color="rgba(255,255,255,0.9)" />
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form card — overlaps hero */}
      <div style={{
        flex: 1, padding: '0 20px 32px', marginTop: '-28px', position: 'relative', zIndex: 1,
      }}>
        <div style={{
          background: 'white', borderRadius: '24px', padding: '28px 24px',
          boxShadow: '0 8px 40px rgba(124,58,237,0.12)',
        }}>
          {/* Google OAuth */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
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
              shape="pill"
              size="large"
              width="300"
              text="continue_with"
            />
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
            <div style={{ flex: 1, height: '1px', background: '#E8E5F0' }} />
            <span style={{ fontSize: '11px', color: '#8E8EA0', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              or sign in with email
            </span>
            <div style={{ flex: 1, height: '1px', background: '#E8E5F0' }} />
          </div>

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A4A6A', marginBottom: '6px' }}>
                Email address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8E8EA0' }} />
                <input
                  type="email" value={email} placeholder="name@company.com"
                  onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
                  style={{
                    width: '100%', padding: '14px 14px 14px 42px', borderRadius: '14px', fontSize: '15px',
                    border: errors.email ? '1.5px solid #EF4444' : '1.5px solid #E8E5F0',
                    background: '#F8F7FF', color: '#1A1A2E', outline: 'none',
                    transition: 'border-color 200ms',
                  }}
                  onFocus={e => { if (!errors.email) e.target.style.borderColor = '#7C3AED' }}
                  onBlur={e => { if (!errors.email) e.target.style.borderColor = '#E8E5F0' }}
                />
              </div>
              {errors.email && <p style={{ fontSize: '12px', color: '#EF4444', margin: '4px 0 0 4px' }}>{errors.email}</p>}
            </div>

            {/* Password */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A4A6A', marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8E8EA0' }} />
                <input
                  type={showPassword ? 'text' : 'password'} value={password} placeholder="Enter your password"
                  onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
                  style={{
                    width: '100%', padding: '14px 44px 14px 42px', borderRadius: '14px', fontSize: '15px',
                    border: errors.password ? '1.5px solid #EF4444' : '1.5px solid #E8E5F0',
                    background: '#F8F7FF', color: '#1A1A2E', outline: 'none',
                    transition: 'border-color 200ms',
                  }}
                  onFocus={e => { if (!errors.password) e.target.style.borderColor = '#7C3AED' }}
                  onBlur={e => { if (!errors.password) e.target.style.borderColor = '#E8E5F0' }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8E8EA0', cursor: 'pointer', padding: '4px' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p style={{ fontSize: '12px', color: '#EF4444', margin: '4px 0 0 4px' }}>{errors.password}</p>}
            </div>

            {/* Forgot password */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
              <button type="button" onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotSent(false) }}
                style={{ fontSize: '13px', fontWeight: 600, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button type="submit" disabled={isLoading}
              style={{
                width: '100%', padding: '16px', borderRadius: '16px', border: 'none',
                background: 'linear-gradient(135deg, #7C3AED, #5B21B6)',
                color: 'white', fontSize: '16px', fontWeight: 700, cursor: isLoading ? 'wait' : 'pointer',
                opacity: isLoading ? 0.7 : 1, transition: 'opacity 200ms',
                boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
              {isLoading ? (
                <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              ) : (
                <>
                  <Sparkles size={18} />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        {/* Register link */}
        <p style={{ textAlign: 'center', fontSize: '14px', color: '#8E8EA0', marginTop: '24px' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#7C3AED', fontWeight: 700, textDecoration: 'none' }}>
            Create one free
          </Link>
        </p>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowForgot(false)}>
          <div style={{
            background: 'white', borderRadius: '24px 24px 0 0', padding: '28px 24px', paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
            width: '100%', maxWidth: '500px',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
          }} onClick={e => e.stopPropagation()}>
            {/* Drag handle */}
            <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#E8E5F0', margin: '0 auto 20px' }} />

            {forgotSent ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 16px',
                  background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Mail size={28} color="#7C3AED" />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1A2E', marginBottom: '8px' }}>Check your email</h3>
                <p style={{ fontSize: '14px', color: '#8E8EA0', marginBottom: '24px', lineHeight: 1.5 }}>
                  If an account exists for <strong style={{ color: '#4A4A6A' }}>{forgotEmail}</strong>, we've sent a password reset link.
                </p>
                <button onClick={() => setShowForgot(false)}
                  style={{ width: '100%', padding: '14px', borderRadius: '14px', border: 'none', background: '#7C3AED', color: 'white', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
                  Got it
                </button>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1A2E', marginBottom: '8px' }}>Forgot your password?</h3>
                <p style={{ fontSize: '14px', color: '#8E8EA0', marginBottom: '20px', lineHeight: 1.5 }}>
                  Enter your email and we'll send a reset link.
                </p>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  if (!forgotEmail) return
                  setForgotLoading(true)
                  try {
                    await api.post('/auth/forgot-password', { email: forgotEmail })
                    setForgotSent(true)
                  } catch {
                    setForgotSent(true)
                  } finally {
                    setForgotLoading(false)
                  }
                }}>
                  <div style={{ position: 'relative', marginBottom: '16px' }}>
                    <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8E8EA0' }} />
                    <input
                      type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      placeholder="Enter your email" autoFocus required
                      style={{
                        width: '100%', padding: '14px 14px 14px 42px', borderRadius: '14px', fontSize: '15px',
                        border: '1.5px solid #E8E5F0', background: '#F8F7FF', color: '#1A1A2E', outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={() => setShowForgot(false)}
                      style={{ flex: 1, padding: '14px', borderRadius: '14px', border: '1.5px solid #E8E5F0', background: 'white', color: '#4A4A6A', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={forgotLoading}
                      style={{ flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: '#7C3AED', color: 'white', fontSize: '15px', fontWeight: 700, cursor: forgotLoading ? 'wait' : 'pointer', opacity: forgotLoading ? 0.7 : 1 }}>
                      {forgotLoading ? 'Sending...' : 'Send link'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default MobileLoginPage
