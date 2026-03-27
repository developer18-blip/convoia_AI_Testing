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
    <div className="min-h-screen flex">
      {/* Left — Form Side */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-20 bg-background relative">
        <div className="absolute top-5 right-5 z-10">
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-[420px] mx-auto"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 mb-10">
            <img src="/logo.png" alt="ConvoiaAI" style={{ height: '48px', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
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
              width="420"
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
              <button type="button" className="text-sm text-primary hover:text-primary-hover font-medium transition-colors">
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
            <div className="flex items-center gap-2 mb-6">
              <Sparkles size={20} />
              <span className="text-sm font-medium text-white/80 uppercase tracking-wider">Powered by AI</span>
            </div>

            <h2 className="text-4xl xl:text-5xl font-bold leading-tight mb-6">
              One platform.<br />
              Every AI model.<br />
              <span className="text-white/70">Unlimited potential.</span>
            </h2>

            <p className="text-lg text-white/70 mb-12 max-w-md leading-relaxed">
              Access GPT-5, Claude Opus, Gemini Pro, and 30+ more models through a single, powerful interface.
            </p>

            <div className="grid grid-cols-2 gap-5">
              {features.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3.5"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                    <f.icon size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{f.label}</p>
                    <p className="text-xs text-white/60">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Social proof */}
            <div className="mt-14 flex items-center gap-4">
              <div className="flex -space-x-2">
                {['#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD'].map((color, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white/20" style={{ background: color }} />
                ))}
              </div>
              <div>
                <p className="text-sm font-semibold">Trusted by 500+ teams</p>
                <p className="text-xs text-white/60">From startups to enterprises</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
