import { useState, useEffect, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Sparkles, Shield, Zap, Globe, Brain } from 'lucide-react'
import { GoogleLogin } from '@react-oauth/google'
import { ThemeToggle } from '../../components/shared/ThemeToggle'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api from '../../lib/api'

const features = [
  { icon: Brain, label: '35+ AI Models', desc: 'GPT, Claude, Gemini & more' },
  { icon: Globe, label: 'Web Search', desc: 'Real-time data access' },
  { icon: Shield, label: 'Enterprise Security', desc: 'SOC 2 compliant' },
  { icon: Zap, label: 'Lightning Fast', desc: 'Sub-second responses' },
]

export function LoginPage() {
  const { login, googleLogin } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('inviteToken')
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  return (
    <div className="min-h-dvh flex">
      {/* Left — Form Side */}
      <div className="flex-1 flex flex-col justify-center px-5 sm:px-12 lg:px-20 py-8 bg-background relative">
        <div className="absolute top-5 right-5 z-10" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-[400px] mx-auto"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 mb-10">
            <img src="/logo.png?v=2" alt="ConvoiaAI" style={{ height: '48px', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </Link>

          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Welcome back</h1>
          <p className="text-text-muted mt-2 mb-8">Sign in to continue to your AI gateway</p>

          {/* Google OAuth */}
          <div className="mb-6">
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

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-3 text-text-muted tracking-wider">or sign in with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email address"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })) }}
              error={errors.email}
              icon={<Mail size={16} />}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })) }}
              error={errors.password}
              icon={<Lock size={16} />}
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input type="checkbox" className="rounded border-border bg-surface text-primary focus:ring-primary w-4 h-4" />
                <span>Remember me</span>
              </label>
              <button type="button" onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotSent(false) }} className="text-sm text-primary hover:text-primary-hover font-medium transition-colors">
                Forgot password?
              </button>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full !py-3 !text-base !font-semibold">
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-text-muted mt-8">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-primary hover:text-primary-hover font-semibold transition-colors">Create one free</Link>
          </p>
        </motion.div>
      </div>

      {/* Right — Feature Panel (hidden on mobile) */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(135deg, #1a1033 0%, #110d24 50%, #0c1425 100%)' : 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 50%, #2563EB 100%)' }}>
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />

        <div className="relative z-10 flex flex-col justify-center px-16 xl:px-20 text-white w-full">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            {/*
              Inline `color` styles below win against any global cascade
              (Tailwind base layer, prose styles, theme CSS variables)
              that was graying-out the hero text. `color` here is
              specified as the element's own style, not via a utility
              class, so nothing short of !important on an ID selector
              can override it.
            */}
            <div className="flex items-center gap-2 mb-6" style={{ color: 'rgba(255,255,255,0.9)' }}>
              <Sparkles size={20} />
              <span className="text-sm font-medium uppercase tracking-wider">Powered by AI</span>
            </div>

            <h2 className="text-4xl xl:text-5xl font-bold leading-tight mb-6" style={{ color: '#ffffff' }}>
              One platform.<br />
              Every AI model.<br />
              <span style={{ color: 'rgba(255,255,255,0.92)' }}>Unlimited potential.</span>
            </h2>

            <p className="text-lg mb-12 max-w-md leading-relaxed" style={{ color: 'rgba(255,255,255,0.88)' }}>
              Access GPT-5, Claude Opus, Gemini Pro, and 30+ more models through a single, powerful interface.
            </p>

            <div className="grid grid-cols-2 gap-5">
              {features.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-3 rounded-xl px-4 py-3.5"
                  style={{
                    background: 'rgba(255,255,255,0.14)',
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.22)', color: '#ffffff' }}
                  >
                    <f.icon size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#ffffff' }}>{f.label}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.82)' }}>{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Social proof — colored avatar dots restored */}
            <div className="mt-14 flex items-center gap-4">
              <div className="flex -space-x-2">
                {['#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD'].map((color, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full"
                    style={{ background: color, border: '2px solid rgba(255,255,255,0.35)' }}
                  />
                ))}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#ffffff' }}>Trusted by 500+ teams</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.82)' }}>From startups to enterprises</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowForgot(false)}>
          <div style={{ background: 'var(--color-surface)', borderRadius: '16px', padding: '28px', maxWidth: '400px', width: '90%', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}>
            {forgotSent ? (
              <div style={{ textAlign: 'center' }}>
                <Mail size={40} style={{ color: 'var(--color-primary)', margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Check your email</h3>
                <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
                  If an account exists for <strong>{forgotEmail}</strong>, we've sent a password reset link.
                </p>
                <button onClick={() => setShowForgot(false)}
                  style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                  Got it
                </button>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Forgot your password?</h3>
                <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
                  Enter your email and we'll send you a link to reset your password.
                </p>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  if (!forgotEmail) return
                  setForgotLoading(true)
                  try {
                    await api.post('/auth/forgot-password', { email: forgotEmail })
                    setForgotSent(true)
                  } catch {
                    setForgotSent(true) // Still show success to prevent email enumeration
                  } finally {
                    setForgotLoading(false)
                  }
                }}>
                  <input
                    type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="Enter your email" autoFocus required
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '10px', marginBottom: '12px',
                      border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                      color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowForgot(false)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={forgotLoading}
                      style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: forgotLoading ? 'wait' : 'pointer', opacity: forgotLoading ? 0.7 : 1 }}>
                      {forgotLoading ? 'Sending...' : 'Send reset link'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginPage
